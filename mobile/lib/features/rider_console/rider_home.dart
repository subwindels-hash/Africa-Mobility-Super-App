import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/location/location_service.dart';
import '../../core/network/api_client.dart';

/// Rider console (rider flavor — dispatch riders, docs/11 §flavors): delivery
/// job queue with pickup/dropoff sequencing, proof-of-delivery capture and
/// daily earnings.

class RiderJob {
  const RiderJob({required this.id, required this.pickup, required this.dropoff, required this.payoutMinor, this.express = false});
  final String id;
  final String pickup;
  final String dropoff;
  final int payoutMinor;
  final bool express;
}

class RiderShiftState {
  const RiderShiftState({this.online = false, this.jobs = const [], this.earnedTodayMinor = 0, this.deliveredToday = 0});
  final bool online;
  final List<RiderJob> jobs;
  final int earnedTodayMinor;
  final int deliveredToday;

  RiderShiftState copyWith({bool? online, List<RiderJob>? jobs, int? earnedTodayMinor, int? deliveredToday}) =>
      RiderShiftState(online: online ?? this.online, jobs: jobs ?? this.jobs,
          earnedTodayMinor: earnedTodayMinor ?? this.earnedTodayMinor, deliveredToday: deliveredToday ?? this.deliveredToday);
}

class RiderShiftController extends StateNotifier<RiderShiftState> {
  RiderShiftController(this._ref) : super(const RiderShiftState());

  final Ref _ref;

  Future<void> toggleOnline() async {
    final goingOnline = !state.online;
    state = state.copyWith(online: goingOnline);
    if (goingOnline) {
      await _ref.read(locationServiceProvider).startTracking(distanceFilterM: 10);
      // fetch the assigned delivery queue
      final res = await _ref.read(apiClientProvider).get('/v1/dispatch/queue');
      final jobs = ((res.data['jobs'] ?? []) as List)
          .map((j) => RiderJob(
                id: j['id'] as String,
                pickup: j['pickup'] as String,
                dropoff: j['dropoff'] as String,
                payoutMinor: j['payoutMinor'] as int? ?? 0,
                express: j['express'] as bool? ?? false,
              ))
          .toList();
      state = state.copyWith(jobs: jobs);
    } else {
      await _ref.read(locationServiceProvider).stopTracking();
      state = state.copyWith(jobs: []);
    }
  }

  /// Complete a delivery with photo + signature proof (docs/32 §cargo-security).
  Future<void> completeDelivery(RiderJob job, {required String photoId, required String signedBy}) async {
    await _ref.read(apiClientProvider).post('/v1/interstate/shipments/${job.id}/proof', data: {
      'type': 'delivery',
      'photos': [photoId],
      'signedBy': signedBy,
    });
    state = state.copyWith(
      jobs: state.jobs.where((j) => j.id != job.id).toList(),
      earnedTodayMinor: state.earnedTodayMinor + job.payoutMinor,
      deliveredToday: state.deliveredToday + 1,
    );
  }
}

final riderShiftProvider = StateNotifierProvider<RiderShiftController, RiderShiftState>((ref) => RiderShiftController(ref));

class RiderHomeScreen extends ConsumerWidget {
  const RiderHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shift = ref.watch(riderShiftProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rider console'),
        actions: [Switch(value: shift.online, onChanged: (_) => ref.read(riderShiftProvider.notifier).toggleOnline())],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: shift.online ? const Color(0xFF0E7C86) : const Color(0xFF667085), borderRadius: BorderRadius.circular(24)),
            child: Text(
              shift.online ? 'ONLINE · ${shift.jobs.length} drop-offs queued' : 'OFFLINE',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 8),
          Text('₦${(shift.earnedTodayMinor / 100).toStringAsFixed(0)} earned · ${shift.deliveredToday} delivered',
              style: const TextStyle(color: Color(0xFF475467))),
          const SizedBox(height: 12),
          for (final j in shift.jobs)
            Card(
              child: ListTile(
                title: Text('${j.pickup} → ${j.dropoff}${j.express ? ' ⚡' : ''}'),
                subtitle: Text('Payout ₦${(j.payoutMinor / 100).toStringAsFixed(0)}'),
                trailing: FilledButton(
                  onPressed: () => ref.read(riderShiftProvider.notifier).completeDelivery(j, photoId: 'img_delivery', signedBy: 'Recipient'),
                  child: const Text('Delivered'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
