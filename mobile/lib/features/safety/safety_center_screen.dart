import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/safety/sos_manager.dart';
import '../../core/location/location_service.dart';

/// Safety Center (docs/13 §safety screens): SOS with shake detection,
/// trusted contacts, live trip sharing and the masked-call line.

class SafetyCenterScreen extends ConsumerWidget {
  const SafetyCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sos = ref.watch(sosManagerProvider);
    final location = ref.read(locationServiceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Safety center')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: const Color(0xFFD92D20), borderRadius: BorderRadius.circular(24)),
            child: Column(children: [
              const Text('Emergency SOS', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              const Text('Shake your phone or hold the button — AMSA alerts your contacts, dispatch and police line with your live location.',
                  style: TextStyle(color: Colors.white70, fontSize: 12), textAlign: TextAlign.center),
              const SizedBox(height: 14),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFFD92D20)),
                onPressed: () => sos.trigger(source: 'safety_center'),
                child: Text(sos.isActive ? 'SOS ACTIVE — responders notified' : 'Hold for emergency'),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          const _SafetyTile(icon: Icons.share_location_outlined, title: 'Share live trip', subtitle: 'Send a tracking link to family — expires at drop-off'),
          const _SafetyTile(icon: Icons.call_outlined, title: 'Masked call', subtitle: 'Call your driver without exposing your number'),
          const _SafetyTile(icon: Icons.contacts_outlined, title: 'Trusted contacts', subtitle: '3 contacts alerted on SOS'),
          const _SafetyTile(icon: Icons.health_and_safety_outlined, title: 'Medical ID', subtitle: 'Blood type & allergies for responders'),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => location.startTracking(),
            icon: const Icon(Icons.my_location_outlined),
            label: const Text('Enable precise location for emergencies'),
          ),
        ],
      ),
    );
  }
}

class _SafetyTile extends StatelessWidget {
  const _SafetyTile({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(child: Icon(icon)),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
      );
}
