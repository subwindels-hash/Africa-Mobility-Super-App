import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';

/// Shared booking flow pieces (docs/11 §booking_common): live tracking sheet,
/// driver card, payment/escrow status and cancel — reused by ride, logistics,
/// intercity and security bookings.

class BookingSummary {
  const BookingSummary({required this.id, required this.service, required this.status, required this.totalMinor, this.vendor, this.etaMin});
  final String id;
  final String service;
  final String status;
  final int totalMinor;
  final String? vendor;
  final int? etaMin;
}

class BookingFlowController extends StateNotifier<TrackState> {
  BookingFlowController(this._ref, this.bookingId) : super(const TrackState()) {
    final socket = _ref.read(socketServiceProvider);
    socket.joinRoom('booking:$bookingId');
    socket.on('position', (p) {
      final m = (p as Map).cast<String, dynamic>();
      state = state.copyWith(lat: (m['lat'] as num?)?.toDouble(), lng: (m['lng'] as num?)?.toDouble(), etaMin: m['etaMin'] as int?);
    });
    socket.on('status', (s) => state = state.copyWith(status: s as String));
  }

  final Ref _ref;
  final String bookingId;

  Future<void> cancel() async => _ref.read(apiClientProvider).post('/v1/bookings/$bookingId/cancel');

  @override
  void dispose() {
    _ref.read(socketServiceProvider).leaveRoom('booking:$bookingId');
    super.dispose();
  }
}

final bookingFlowProvider = StateNotifierProvider.family<BookingFlowController, TrackState, String>((ref, id) => BookingFlowController(ref, id));

/// Live tracking sheet shown under every active booking (wireframe C-06).
class LiveTrackingSheet extends ConsumerWidget {
  const LiveTrackingSheet({super.key, required this.booking, required this.mapWidget});
  final BookingSummary booking;
  final Widget mapWidget;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final track = ref.watch(bookingFlowProvider(booking.id));
    return Column(
      children: [
        Expanded(child: mapWidget),
        Container(
          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(24)), boxShadow: [BoxShadow(blurRadius: 20, color: Color(0x140F172A))]),
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(booking.service, style: Theme.of(context).textTheme.titleMedium)),
              _StatusPill(status: track.status ?? booking.status),
            ]),
            const SizedBox(height: 12),
            Text(track.etaMin != null ? 'Arrives in ${track.etaMin} min' : 'Connecting to live tracking…',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(booking.vendor ?? 'Matching the best provider…', style: const TextStyle(color: Color(0xFF475467), fontSize: 13)),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => ref.read(bookingFlowProvider(booking.id).notifier).cancel(),
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD92D20)),
                  icon: const Icon(Icons.close),
                  label: const Text('Cancel booking'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _EscrowPanel())),
                  icon: const Icon(Icons.lock_outline),
                  label: Text('₦${(booking.totalMinor / 100).toStringAsFixed(0)} in escrow'),
                ),
              ),
            ]),
          ]),
        ),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'driver_assigned' || 'in_transit' => const Color(0xFF17A558),
      'delivered' || 'completed' => const Color(0xFF0E67A6),
      'disputed' => const Color(0xFFD92D20),
      _ => const Color(0xFFDC6803),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(status.replaceAll('_', ' '), style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _EscrowPanel extends ConsumerWidget {
  const _EscrowPanel();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: const Text('Escrow protection')),
        body: const Padding(
          padding: EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('🔒 Your money is protected', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            SizedBox(height: 8),
            Text('Funds sit in AMSA escrow. The vendor is paid automatically after delivery confirmation — commission and taxes deducted. Open a dispute anytime within 24h of delivery.'),
            SizedBox(height: 16),
            ListTile(contentPadding: EdgeInsets.zero, title: Text('Merchant safeguards'), subtitle: Text('Chargebacks · arbitration · refunds')),
          ]),
        ),
      );
}
