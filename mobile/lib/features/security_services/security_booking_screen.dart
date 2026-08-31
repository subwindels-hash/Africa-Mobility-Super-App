import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Security services marketplace (docs/03 §security): vetted operatives for
/// bodyguards, VIP convoys, event security, executive protection, cash
/// transit — armed tiers gated to verified corporate clients.

class SecurityServiceView {
  const SecurityServiceView(this.code, this.label, this.icon);
  final String code;
  final String label;
  final IconData icon;
}

const securityServices = [
  SecurityServiceView('bodyguard', 'Bodyguard', Icons.shield_outlined),
  SecurityServiceView('vip_convoy', 'VIP Convoy', Icons.directions_car_outlined),
  SecurityServiceView('event_security', 'Event Security', Icons.groups_outlined),
  SecurityServiceView('executive_protection', 'Executive Protection', Icons.workspace_premium_outlined),
  SecurityServiceView('surveillance_install', 'Surveillance Install', Icons.videocam_outlined),
  SecurityServiceView('security_consulting', 'Security Consulting', Icons.policy_outlined),
  SecurityServiceView('cash_transit', 'Cash Transit', Icons.local_shipping_outlined),
];

class SecurityBookingScreen extends ConsumerStatefulWidget {
  const SecurityBookingScreen({super.key});

  @override
  ConsumerState<SecurityBookingScreen> createState() => _SecurityBookingScreenState();
}

class _SecurityBookingScreenState extends ConsumerState<SecurityBookingScreen> {
  String? _selected;
  int _agents = 2;
  int _hours = 8;

  Future<void> _book() async {
    if (_selected == null) return;
    await ref.read(apiClientProvider).post('/v1/verticals/security/book', data: {
      'providerId': 'sec_vg',
      'customerId': 'cus_mobile',
      'priceMinor': 450_000 * _agents * _hours,
      'details': {'service': _selected, 'agents': _agents, 'hours': _hours},
    });
    if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(const SnackBar(content: Text('Security request booked — escrow protected')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Security services')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in securityServices)
                ChoiceChip(
                  avatar: Icon(s.icon, size: 18),
                  label: Text(s.label),
                  selected: _selected == s.code,
                  onSelected: (_) => setState(() => _selected = s.code),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Row(children: [
            const Expanded(child: Text('Agents')),
            IconButton(icon: const Icon(Icons.remove), onPressed: () => setState(() => _agents = (_agents - 1).clamp(1, 20))),
            Text('$_agents', style: const TextStyle(fontWeight: FontWeight.w700)),
            IconButton(icon: const Icon(Icons.add), onPressed: () => setState(() => _agents = (_agents + 1).clamp(1, 20))),
          ]),
          Row(children: [
            const Expanded(child: Text('Hours')),
            IconButton(icon: const Icon(Icons.remove), onPressed: () => setState(() => _hours = (_hours - 1).clamp(1, 72))),
            Text('$_hours', style: const TextStyle(fontWeight: FontWeight.w700)),
            IconButton(icon: const Icon(Icons.add), onPressed: () => setState(() => _hours = (_hours + 1).clamp(1, 72))),
          ]),
          const SizedBox(height: 8),
          Text('Estimated: ₦${(450_000 * _agents * _hours / 100).toStringAsFixed(0)} · escrow protected',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          const Text('Armed services (convoy, executive protection, cash transit) require a verified corporate account and police clearance.',
              style: TextStyle(fontSize: 12, color: Color(0xFF475467))),
          const SizedBox(height: 16),
          FilledButton(onPressed: _selected == null ? null : _book, child: const Text('Book security detail')),
        ],
      ),
    );
  }
}
