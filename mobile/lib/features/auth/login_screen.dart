import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Auth feature (docs/11 §auth): phone → OTP → (MFA challenge on new
/// devices) → session. Wallet/booking features unlock only after login.

enum AuthStep { phone, otp, mfa, done }

class AuthState {
  const AuthState({this.step = AuthStep.phone, this.phone, this.maskedPhone, this.newDevice = false, this.loading = false, this.error});
  final AuthStep step;
  final String? phone;
  final String? maskedPhone;
  final bool newDevice;
  final bool loading;
  final String? error;

  AuthState copyWith({AuthStep? step, String? phone, String? maskedPhone, bool? newDevice, bool? loading, String? error}) =>
      AuthState(step: step ?? this.step, phone: phone ?? this.phone, maskedPhone: maskedPhone ?? this.maskedPhone,
          newDevice: newDevice ?? this.newDevice, loading: loading ?? this.loading, error: error);
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState());

  final Ref _ref;

  Future<void> requestOtp(String phone) async {
    state = state.copyWith(loading: true, error: null, phone: phone);
    try {
      await _ref.read(apiClientProvider).post('/v1/auth/otp', data: {'phone': phone});
      state = state.copyWith(loading: false, step: AuthStep.otp, maskedPhone: _mask(phone));
    } catch (e) {
      state = state.copyWith(loading: false, error: 'Could not send code — try again');
    }
  }

  Future<void> verifyOtp(String code) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await _ref.read(apiClientProvider).post('/v1/auth/verify', data: {'phone': state.phone, 'code': code});
      final newDevice = (res.data['newDevice'] as bool?) ?? false;
      // MFA is challenged on untrusted devices (libs/auth SessionStore)
      state = state.copyWith(loading: false, step: newDevice ? AuthStep.mfa : AuthStep.done, newDevice: newDevice);
    } catch (e) {
      state = state.copyWith(loading: false, error: 'Wrong code — check and retype');
    }
  }

  Future<void> verifyMfa(String totpCode) async {
    state = state.copyWith(loading: true, error: null);
    try {
      await _ref.read(apiClientProvider).post('/v1/auth/mfa/verify', data: {'code': totpCode});
      state = state.copyWith(loading: false, step: AuthStep.done);
    } catch (e) {
      state = state.copyWith(loading: false, error: 'Invalid authenticator code');
    }
  }

  static String _mask(String phone) => '••• ${phone.substring(phone.length - 4)}';
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final controller = TextEditingController();

    return Scaffold(
      appBar: AppBar(title: const Text('Welcome to AMSA')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              switch (auth.step) {
                AuthStep.phone => 'Enter your phone number',
                AuthStep.otp => 'Enter the 6-digit code sent to ${auth.maskedPhone}',
                AuthStep.mfa => 'New device — enter your authenticator code',
                AuthStep.done => 'Signed in ✅',
              },
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: auth.step == AuthStep.mfa ? TextInputType.number : TextInputType.phone,
              maxLength: auth.step == AuthStep.phone ? 14 : 6,
              decoration: InputDecoration(hintText: auth.step == AuthStep.phone ? '+234…' : '••••••', counterText: ''),
            ),
            if (auth.error != null)
              Padding(padding: const EdgeInsets.only(top: 8), child: Text(auth.error!, style: const TextStyle(color: Color(0xFFD92D20)))),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: auth.loading
                  ? null
                  : () => switch (auth.step) {
                        AuthStep.phone => ref.read(authControllerProvider.notifier).requestOtp(controller.text.trim()),
                        AuthStep.otp => ref.read(authControllerProvider.notifier).verifyOtp(controller.text.trim()),
                        AuthStep.mfa => ref.read(authControllerProvider.notifier).verifyMfa(controller.text.trim()),
                        AuthStep.done => null,
                      },
              child: Text(auth.loading ? 'Verifying…' : 'Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
