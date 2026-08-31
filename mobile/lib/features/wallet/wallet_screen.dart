import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Wallet feature (docs/11 §wallet): balance, escrow-held funds, top-up via
/// Paystack/Flutterwave/Monnify, P2P transfers and statements.

class WalletViewState {
  const WalletViewState({this.balanceMinor, this.escrowMinor, this.entries = const [], this.loading = false});
  final int? balanceMinor;
  final int? escrowMinor;
  final List<Map<String, dynamic>> entries;
  final bool loading;

  WalletViewState copyWith({int? balanceMinor, int? escrowMinor, List<Map<String, dynamic>>? entries, bool? loading}) =>
      WalletViewState(balanceMinor: balanceMinor ?? this.balanceMinor, escrowMinor: escrowMinor ?? this.escrowMinor,
          entries: entries ?? this.entries, loading: loading ?? this.loading);
}

class WalletController extends StateNotifier<WalletViewState> {
  WalletController(this._ref) : super(const WalletViewState());

  final Ref _ref;

  Future<void> load() async {
    state = state.copyWith(loading: true);
    final res = await _ref.read(apiClientProvider).get('/v1/wallets/me');
    state = WalletViewState(
      balanceMinor: res.data['availableMinor'] as int?,
      escrowMinor: res.data['escrowMinor'] as int?,
      entries: ((res.data['entries'] ?? []) as List).cast<Map<String, dynamic>>(),
    );
  }

  /// Top-up → PSP checkout (Paystack primary, Flutterwave/Monnify failover
  /// handled server-side by the payments service).
  Future<void> topUp(int amountMinor) async {
    final res = await _ref.read(apiClientProvider).post('/v1/payments/initialize', data: {
      'reference': 'top_${DateTime.now().millisecondsSinceEpoch}',
      'amountMinor': amountMinor,
      'email': 'customer@amsa.africa',
      'channel': 'card',
    });
    // In production this opens the hosted checkout URL in a WebView, then the
    // PSP webhook settles the wallet (payments.onSettled hook).
    debugPrint('checkout: ${res.data['authorizationUrl']}');
    await load();
  }

  Future<void> transfer(String toUserId, int amountMinor) async {
    await _ref.read(apiClientProvider).post('/v1/wallets/transfer', data: {'toUserId': toUserId, 'amountMinor': amountMinor});
    await load();
  }
}

final walletControllerProvider = StateNotifierProvider<WalletController, WalletViewState>((ref) => WalletController(ref));

String naira(int? minor) => '₦${((minor ?? 0) / 100).toStringAsFixed(2)}';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(walletControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: const Color(0xFF101828), borderRadius: BorderRadius.circular(24)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Available balance', style: TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 4),
              Text(naira(view.balanceMinor), style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('In escrow: ${naira(view.escrowMinor)}', style: const TextStyle(color: Color(0xFF84CAFF), fontSize: 12)),
            ]),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: FilledButton.icon(onPressed: () => ref.read(walletControllerProvider.notifier).topUp(500_000), icon: const Icon(Icons.add), label: const Text('Top up ₦5,000'))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.send_outlined), label: const Text('Send'))),
          ]),
          const SizedBox(height: 20),
          for (final e in view.entries.take(12))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(child: Icon((e['credit'] ?? 0) > 0 ? Icons.south_west : Icons.north_east)),
              title: Text(e['memo'] ?? ''),
              subtitle: Text(e['ref'] ?? ''),
              trailing: Text(naira(((e['credit'] ?? 0) - (e['debit'] ?? 0)).toInt()),
                  style: TextStyle(color: (e['credit'] ?? 0) > 0 ? const Color(0xFF17A558) : const Color(0xFFD92D20))),
            ),
        ],
      ),
    );
  }
}
