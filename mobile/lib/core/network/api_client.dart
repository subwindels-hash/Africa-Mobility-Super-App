import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/env_config.dart';

/// Dio client with auth refresh, idempotency keys and retry (docs/11 §4).
class ApiClient {
  ApiClient(this._ref) {
    _dio = Dio(BaseOptions(
      baseUrl: _ref.read(envConfigProvider).apiBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept-Language': 'en'}, // per-user locale injected by interceptor
    ));
    _dio.interceptors.addAll([
      _authInterceptor(),
      _idempotencyInterceptor(),
      _retryInterceptor(),
    ]);
  }

  final Ref _ref;
  late final Dio _dio;

  InterceptorsWrapper _authInterceptor() => InterceptorsWrapper(
        onRequest: (options, handler) {
          // final token = _ref.read(sessionProvider).accessToken;
          // options.headers['Authorization'] = 'Bearer $token';
          return handler.next(options);
        },
        onError: (e, handler) async {
          if (e.response?.statusCode == 401) {
            // refresh mutex → retry once → else force re-login
          }
          return handler.next(e);
        },
      );

  /// All POST money/booking routes carry Idempotency-Key (24h window).
  InterceptorsWrapper _idempotencyInterceptor() => InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method == 'POST') {
            options.headers['Idempotency-Key'] =
                'idk-${DateTime.now().microsecondsSinceEpoch}';
          }
          return handler.next(options);
        },
      );

  InterceptorsWrapper _retryInterceptor() => InterceptorsWrapper(
        onError: (e, handler) async {
          final retried = e.requestOptions.extra['retried'] == true;
          final retryable = e.type == DioExceptionType.connectionTimeout ||
              e.type == DioExceptionType.receiveTimeout;
          if (!retried && retryable) {
            e.requestOptions.extra['retried'] = true;
            await Future<void>.delayed(const Duration(milliseconds: 600));
            return handler.resolve(await _dio.fetch(e.requestOptions));
          }
          return handler.next(e);
        },
      );

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _dio.get<T>(path, queryParameters: query).then((r) => r.data as T);

  Future<T> post<T>(String path, {Object? body}) =>
      _dio.post<T>(path, data: body).then((r) => r.data as T);
}

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref));
