import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/env_config.dart';

/// Socket.IO realtime service (docs/11 §realtime): booking tracking rooms,
/// chat signaling, driver location streams. Auto-reconnect with backoff;
/// events fall back to FCM push when the socket is cold.
class SocketService {
  SocketService(this._ref) {
    _socket = io.io(
      _ref.read(envConfigProvider).realtimeUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoReconnect()
          .setReconnectionAttempts(8)
          .setReconnectionDelayMs(1000)
          .setReconnectionDelayMaxMs(15000)
          .build(),
    );
  }

  final Ref _ref;
  late final io.Socket _socket;
  final _handlers = <String, void Function(dynamic)>{};

  bool get connected => _socket.connected;

  void connect({String? token}) {
    if (token != null) {
      _socket.io.options?['extraHeaders'] = {'Authorization': 'Bearer $token'};
    }
    _socket.connect();
  }

  /// Join a realtime room (booking:*, shipment:*, chat:*, dispatch:ng-lag).
  void joinRoom(String room) => _socket.emit('room:join', {'room': room});

  void leaveRoom(String room) => _socket.emit('room:leave', {'room': room});

  void on(String event, void Function(dynamic payload) handler) {
    _handlers[event] = handler;
    _socket.on(event, handler);
  }

  /// WebRTC signaling relay (chat-service rooms, docs/26 §video calls).
  void signal(String roomId, String to, String kind, String encryptedPayload) =>
      _socket.emit('signal', {'roomId': roomId, 'to': to, 'kind': kind, 'encryptedPayload': encryptedPayload});

  void dispose() {
    _socket.dispose();
    _handlers.clear();
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final svc = SocketService(ref);
  ref.onDispose(svc.dispose);
  return svc;
});

/// Live driver/cargo position stream for a tracked booking or shipment.
class TrackState {
  const TrackState({this.lat, this.lng, this.etaMin, this.status});
  final double? lat;
  final double? lng;
  final int? etaMin;
  final String? status;

  TrackState copyWith({double? lat, double? lng, int? etaMin, String? status}) =>
      TrackState(lat: lat ?? this.lat, lng: lng ?? this.lng, etaMin: etaMin ?? this.etaMin, status: status ?? this.status);
}

class TrackNotifier extends StateNotifier<TrackState> {
  TrackNotifier(this._ref, this.subjectId) : super(const TrackState()) {
    final socket = _ref.read(socketServiceProvider);
    socket.joinRoom('track:$subjectId');
    socket.on('position', (p) {
      final map = (p as Map).cast<String, dynamic>();
      state = state.copyWith(
        lat: (map['lat'] as num?)?.toDouble(),
        lng: (map['lng'] as num?)?.toDouble(),
        etaMin: map['etaMin'] as int?,
        status: map['status'] as String?,
      );
    });
    socket.on('status', (s) => state = state.copyWith(status: s as String));
  }

  final Ref _ref;
  final String subjectId;

  @override
  void dispose() {
    _ref.read(socketServiceProvider).leaveRoom('track:$subjectId');
    super.dispose();
  }
}

final trackProvider = StateNotifierProvider.family<TrackNotifier, TrackState, String>((ref, id) => TrackNotifier(ref, id));
