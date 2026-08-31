import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/amsa_theme.dart';

class AmsaApp extends ConsumerWidget {
  const AmsaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'AMSA',
      debugShowCheckedModeBanner: false,
      theme: AmsaTheme.light(),
      darkTheme: AmsaTheme.dark(),
      home: const HomeShell(),
    );
  }
}

/// Home shell with service launcher (wireframes C-03 in docs/13).
class HomeShell extends StatelessWidget {
  const HomeShell({super.key});

  static const _services = [
    ('Ride', '🚗', Color(0xFF17A558)),
    ('Send', '📦', Color(0xFF0E7C86)),
    ('Fly', '✈️', Color(0xFF0E67A6)),
    ('Protect', '🛡', Color(0xFF101828)),
    ('Charter', '🚁', Color(0xFFC2932A)),
    ('Intercity', '🚐', Color(0xFF17A558)),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(children: [
              const CircleAvatar(child: Text('A')),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Good morning, Amaka', style: Theme.of(context).textTheme.titleMedium),
                const Text('GOLD ⭐ · ⭐ 6,240 pts', style: TextStyle(fontSize: 12, color: Color(0xFF475467))),
              ]),
              const Spacer(),
              const Icon(Icons.notifications_outlined),
            ]),
            const SizedBox(height: 16),
            TextField(
              decoration: InputDecoration(
                hintText: 'Where to? What to send? Where to fly?',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                fillColor: const Color(0xFFF9FAFB),
                filled: true,
              ),
            ),
            const SizedBox(height: 20),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: [
                for (final s in _services)
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFE4E7EC)),
                    ),
                    padding: const EdgeInsets.all(12),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(s.$2, style: const TextStyle(fontSize: 28)),
                      const SizedBox(height: 8),
                      Text(s.$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: s.$3)),
                    ]),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF0B3D2E),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(children: [
                Icon(Icons.account_balance_wallet_outlined, color: Colors.white),
                SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Wallet', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Text('₦42,500', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                ]),
                Spacer(),
                Text('+ Fund', style: TextStyle(color: Color(0xFF74D69B), fontWeight: FontWeight.w600)),
              ]),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFFD92D20),
        foregroundColor: Colors.white,
        onPressed: () {}, // → SOS flow (core/safety/sos_manager.dart)
        icon: const Icon(Icons.sos),
        label: const Text('SOS'),
      ),
    );
  }
}
