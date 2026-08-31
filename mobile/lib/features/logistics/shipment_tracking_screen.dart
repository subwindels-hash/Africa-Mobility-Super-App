import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Logistics & interstate freight tracking (docs/32 §live-tracking):
/// shipment status timeline, checkpoint feed, geofence/tamper alerts and
/// shareable tracking links.

class ShipmentView {
  const ShipmentView({required this.id, required this.status, required this.service, required this.cargo, this.checkpoints = const []});
  final String id;
  final String status;
  final String service;
  final String cargo;
  final List<Map<String, dynamic>> checkpoints;
}

class ShipmentController extends StateNotifier<ShipmentView?> {
  ShipmentController(this._ref) : super(null);

  final Ref _ref;

  Future<void> load(String shipmentId) async {
    final res = await _ref.read(apiClientProvider).get('/v1/interstate/shipments/$shipmentId');
    final s = (res.data['shipment'] as Map).cast<String, dynamic>();
    state = ShipmentView(
      id: s['id'] as String,
      status: s['status'] as String,
      service: ((s['service']) as String?) ?? '',
      cargo: 'cargo',
      checkpoints: ((s['checkpoints'] ?? []) as List).cast<Map<String, dynamic>>(),
    );
  }

  /// Share a tracking link with an authorized recipient (docs/32 §tracking).
  Future<String> shareTrackingLink(String recipient) async {
    final res = await _ref.read(apiClientProvider).post('/v1/interstate/shipments/${state!.id}/tracking-link', data: {'recipient': recipient});
    return (res.data['link']['token'] as String?) ?? '';
  }
}

final shipmentProvider = StateNotifierProvider<ShipmentController, ShipmentView?>((ref) => ShipmentController(ref));

class ShipmentTrackingScreen extends ConsumerWidget {
  const ShipmentTrackingScreen({super.key, required this.shipmentId});

  final String shipmentId;

  static const _timeline = [
    ('quote_accepted', 'Booking confirmed'),
    ('driver_assigned', 'Driver & vehicle assigned'),
    ('cargo_loaded', 'Cargo loaded · seals applied'),
    ('in_transit', 'In transit'),
    ('delivered', 'Delivered · proof captured'),
    ('completed', 'Completed · vendor paid'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(shipmentProvider);
    return Scaffold(
      appBar: AppBar(title: Text('Shipment ${shipmentId.toUpperCase()}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (view != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(view.service.replaceAll('_', ' '), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text('Status: ${view.status.replaceAll('_', ' ')}', style: const TextStyle(color: Color(0xFF475467))),
                ]),
              ),
            ),
            const SizedBox(height: 8),
            for (final (i, step) in _timeline.indexed)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: i <= _timeline.indexWhere((t) => t.$1 == view.status) ? const Color(0xFF17A558) : const Color(0xFFE4E7EC),
                  child: i <= _timeline.indexWhere((t) => t.$1 == view.status) ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
                ),
                title: Text(step.$2),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                final link = await ref.read(shipmentProvider.notifier).shareTrackingLink('receiver@client.ng');
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Tracking link shared: $link')));
                }
              },
              icon: const Icon(Icons.share_outlined),
              label: const Text('Share tracking link'),
            ),
          ],
        ],
      ),
    );
  }
}
