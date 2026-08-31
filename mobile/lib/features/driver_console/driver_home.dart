import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/location/location_service.dart';
import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';

/// Driver console (driver flavor, docs/11 §flavors): online/offline toggle,
/// job offers with accept/decline, earnings summary and shift stats.

class DriverShiftState {
  const DriverShiftState({this.online = false, this.offers = const [], this.earnedTodayMinor = 0, this.jobsDone = 0});
  final bool online;
  final List<Map<String, dynamic>> offers;
  final int earnedTodayMinor;
  final int jobsDone;

  DriverShiftState copyWith({bool? online, List<Map<String, dynamic>>? offers, int? earnedTodayMinor, int? jobsDone}) =>
      DriverShiftState(online: online ?? this.online, offers: offers ?? this.offers,
          earnedTodayMinor: earnedTodayMinor ?? this.earnedTodayMinor, jobsDone: jobsDone ?? this.jobsDone);
}

class DriverShiftController extends StateNotifier<DriverShiftState> {
  DriverShiftController(this._ref) : super(const DriverShiftState()) {
    final socket = _ref.read(socketServiceProvider);
    socket.on('dispatch:offer', (p) {
      final offer = (p as Map).cast<String, dynamic>();
      state = state.copyWith(offers: [...state.offers, offer]);
    });
  }

  final Ref _ref;

  Future<void> toggleOnline() async {
    final goingOnline = !state.online;
    state = state.copyWith(online: goingOnline);
    if (goingOnline) {
      await _ref.read(locationServiceProvider).startTracking();     // stream positions
      _ref.read(socketServiceProvider).joinRoom('dispatch:ng-lag');  // receive job offers
    } else {
      await _ref.read(locationServiceProvider).stopTracking();
      _ref.read(socketServiceProvider).leaveRoom('dispatch:ng-lag');
    }
  }

  Future<void> accept(String bookingId) async {
    await _ref.read(apiClientProvider).post('/v1/bookings/$bookingId/accept');
    state = state.copyWith(offers: state.offers.where((o) => o['id'] != bookingId).toList());
  }

  void decline(String bookingId) =>
      state = state.copyWith(offers: state.offers.where((o) => o['id'] != bookingId).toList());
}

final driverShiftProvider = StateNotifierProvider<DriverShiftController, DriverShiftState>((ref) => DriverShiftController(ref));

class DriverHomeScreen extends ConsumerWidget {
  const DriverHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shift = ref.watch(driverShiftProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Driver console'), actions: [
        Switch(value: shift.online, onChanged: (_) => ref.read(driverShiftProvider.notifier).toggleOnline()),
      ]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: shift.online ? const Color(0xFF17A558) : const Color(0xFF667085), borderRadius: BorderRadius.circular(24)),
            child: Column(children: [
              Text(shift.online ? 'ONLINE — receiving jobs' : 'OFFLINE', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('₦${(shift.earnedTodayMinor / 100).toStringAsFixed(0)} today · ${shift.jobsDone} trips',
                  style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ]),
          ),
          const SizedBox(height: 16),
          if (shift.offers.isEmpty && shift.online)
            const Center(child: Padding(padding: EdgeInsets.all(40), child: Text('Waiting for dispatch…', style: TextStyle(color: Color(0xFF475467))))),
          for (final offer in shift.offers)
            Card(
              child: ListTile(
                title: Text('${offer['pickup']} → ${offer['dropoff']}'),
                subtitle: Text('₦${((offer['fareMinor'] ?? 0) as int) / 100} · ${offer['distanceKm']} km · ${offer['etaMin']} min away'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(icon: const Icon(Icons.close), onPressed: () => ref.read(driverShiftProvider.notifier).decline(offer['id'] as String)),
                  FilledButton(onPressed: () => ref.read(driverShiftProvider.notifier).accept(offer['id'] as String), child: const Text('Accept')),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}
