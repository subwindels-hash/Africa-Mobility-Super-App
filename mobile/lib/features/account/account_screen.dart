import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/env_config.dart';
import '../loyalty/loyalty_screen.dart';
import '../safety/safety_center_screen.dart';
import '../wallet/wallet_screen.dart';

/// Account feature (docs/11 §account): profile, KYC status, language
/// selection (5 languages), MFA devices, sessions, privacy requests and
/// flavor-aware consoles (driver/rider).

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  static const _languages = {'en': 'English', 'ha': 'Hausa', 'yo': 'Yoruba', 'ig': 'Igbo', 'pcm': 'Nigerian Pidgin'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flavor = ref.watch(envConfigProvider).flavor.name;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Row(children: [
            CircleAvatar(radius: 32, child: Text('A', style: TextStyle(fontSize: 24))),
            SizedBox(width: 16),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Amaka Obi', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              Text('GOLD tier · KYC verified ✓', style: TextStyle(color: Color(0xFF17A558), fontSize: 12)),
            ]),
          ]),
          const SizedBox(height: 16),
          ListTile(leading: const Icon(Icons.account_balance_wallet_outlined), title: const Text('Wallet'), trailing: const Icon(Icons.chevron_right), onTap: () => _push(context, const WalletScreen())),
          ListTile(leading: const Icon(Icons.stars_outlined), title: const Text('Loyalty'), trailing: const Icon(Icons.chevron_right), onTap: () => _push(context, const LoyaltyScreen())),
          ListTile(leading: const Icon(Icons.health_and_safety_outlined), title: const Text('Safety center'), trailing: const Icon(Icons.chevron_right), onTap: () => _push(context, const SafetyCenterScreen())),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.language),
            title: const Text('Language'),
            subtitle: const Text('English · Hausa · Yoruba · Igbo · Pidgin'),
            trailing: DropdownButton<String>(
              items: [for (final e in _languages.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
              onChanged: (_) {},
            ),
          ),
          ListTile(leading: const Icon(Icons.phonelink_lock_outlined), title: const Text('MFA & devices'), subtitle: const Text('Authenticator + trusted devices'), trailing: const Icon(Icons.chevron_right)),
          ListTile(leading: const Icon(Icons.privacy_tip_outlined), title: const Text('Privacy (NDPR/GDPR)'), subtitle: const Text('Export or erase my data'), trailing: const Icon(Icons.chevron_right)),
          const Divider(),
          if (flavor == 'driver' || flavor == 'rider')
            ListTile(
              leading: Icon(flavor == 'driver' ? Icons.drive_eta : Icons.two_wheeler_outlined),
              title: Text(flavor == 'driver' ? 'Driver console' : 'Rider console'),
              subtitle: const Text('Go online, accept jobs, earnings'),
              trailing: const Icon(Icons.chevron_right),
            ),
          const ListTile(leading: Icon(Icons.logout), title: Text('Sign out')),
          const SizedBox(height: 12),
          const Text('AMSA · Africa Mobility Super App', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF98A2B3), fontSize: 12)),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
}
