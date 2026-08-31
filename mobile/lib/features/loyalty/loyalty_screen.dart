import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../wallet/wallet_screen.dart';

/// Loyalty feature (docs/02 §retention): 5 tiers — Basic · Silver · Gold ·
/// Platinum · Executive — with benefits, points redemption and next-tier goal.

class LoyaltyView {
  const LoyaltyView({this.tier = 'basic', this.balancePoints = 0, this.lifetimePoints = 0, this.nextTier, this.pointsRemaining, this.perks = const []});
  final String tier;
  final int balancePoints;
  final int lifetimePoints;
  final String? nextTier;
  final int? pointsRemaining;
  final List<String> perks;
}

class LoyaltyController extends StateNotifier<LoyaltyView> {
  LoyaltyController(this._ref) : super(const LoyaltyView());

  final Ref _ref;

  Future<void> load(String userId) async {
    final res = await _ref.read(apiClientProvider).get('/v1/loyalty/$userId');
    final spec = (res.data['spec'] as Map).cast<String, dynamic>();
    final next = res.data['nextTier'] as Map<String, dynamic>?;
    state = LoyaltyView(
      tier: res.data['tier'] as String,
      balancePoints: res.data['balancePoints'] as int? ?? 0,
      lifetimePoints: res.data['lifetimePoints'] as int? ?? 0,
      nextTier: next?['tier'] as String?,
      pointsRemaining: next?['pointsRemaining'] as int?,
      perks: ((spec['perks'] ?? []) as List).cast<String>(),
    );
  }

  /// Redeem points → wallet credit at the documented rate (₦0.008/pt).
  Future<void> redeem(int points) async {
    await _ref.read(apiClientProvider).post('/v1/loyalty/redeem', data: {'userId': 'me', 'points': points});
    await load('me');
  }
}

final loyaltyProvider = StateNotifierProvider<LoyaltyController, LoyaltyView>((ref) => LoyaltyController(ref));

class LoyaltyScreen extends ConsumerWidget {
  const LoyaltyScreen({super.key});

  static const _tierColor = {
    'basic': Color(0xFF667085), 'silver': Color(0xFF98A2B3), 'gold': Color(0xFFC2932A),
    'platinum': Color(0xFF0E67A6), 'executive': Color(0xFF101828),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = ref.watch(loyaltyProvider);
    final color = _tierColor[l.tier] ?? const Color(0xFF667085);
    return Scaffold(
      appBar: AppBar(title: const Text('Loyalty')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [color, const Color(0xFF101828)]),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.tier.toUpperCase(), style: const TextStyle(color: Colors.white70, letterSpacing: 2, fontSize: 12)),
              const SizedBox(height: 4),
              Text('${l.balancePoints} pts', style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
              if (l.nextTier != null)
                Text('${l.pointsRemaining} pts to ${l.nextTier!.toUpperCase()}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
          const SizedBox(height: 16),
          for (final perk in l.perks) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.check_circle_outline, color: Color(0xFF17A558)), title: Text(perk)),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: l.balancePoints >= 1000 ? () => ref.read(loyaltyProvider.notifier).redeem(1000) : null,
            child: Text('Redeem 1,000 pts → ${naira(80000)} wallet credit'),
          ),
        ],
      ),
    );
  }
}
