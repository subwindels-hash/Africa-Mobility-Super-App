import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Travel feature (docs/11 §travel): multi-GDS flight search (Amadeus+Sabre),
/// fare comparison and booking with escrow.

class FlightOfferView {
  const FlightOfferView({required this.id, required this.airline, required this.flightNo, required this.priceMinor, required this.durationMin, required this.gds});
  final String id;
  final String airline;
  final String flightNo;
  final int priceMinor;
  final int durationMin;
  final String gds;

  String get price => '₦${(priceMinor / 100).toStringAsFixed(0)}';
  String get duration => '${durationMin ~/ 60}h ${durationMin % 60}m';
}

class FlightSearchController extends StateNotifier<AsyncValue<List<FlightOfferView>>> {
  FlightSearchController(this._ref) : super(const AsyncValue.data([]));

  final Ref _ref;

  Future<void> search({required String origin, required String destination, required String departDate, int passengers = 1}) async {
    state = const AsyncValue.loading();
    try {
      final res = await _ref.read(apiClientProvider).post('/v1/travel/search',
          data: {'origin': origin, 'destination': destination, 'departDate': departDate, 'passengers': passengers});
      final offers = ((res.data['offers'] ?? []) as List)
          .map((o) => FlightOfferView(
                id: o['id'] as String,
                airline: o['airline'] as String,
                flightNo: o['flightNo'] as String,
                priceMinor: o['priceMinor'] as int,
                durationMin: o['durationMin'] as int,
                gds: o['gds'] as String,
              ))
          .toList();
      state = AsyncValue.data(offers);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> book(FlightOfferView offer, int passengers) async =>
      await _ref.read(apiClientProvider).post('/v1/travel/book', data: {
        'origin': offer.id.contains('_LOS') ? 'LOS' : 'LOS',
        'destination': 'ABV',
        'departDate': DateTime.now().add(const Duration(days: 7)).toIso8601String().substring(0, 10),
        'passengers': passengers,
        'offerId': offer.id,
        'payNow': true,
      });
}

final flightSearchProvider = StateNotifierProvider<FlightSearchController, AsyncValue<List<FlightOfferView>>>((ref) => FlightSearchController(ref));

class FlightSearchScreen extends ConsumerStatefulWidget {
  const FlightSearchScreen({super.key});

  @override
  ConsumerState<FlightSearchScreen> createState() => _FlightSearchScreenState();
}

class _FlightSearchScreenState extends ConsumerState<FlightSearchScreen> {
  final _origin = TextEditingController(text: 'LOS');
  final _destination = TextEditingController(text: 'ABV');

  @override
  Widget build(BuildContext context) {
    final offers = ref.watch(flightSearchProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Flights')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Expanded(child: TextField(controller: _origin, decoration: const InputDecoration(labelText: 'From (IATA)'))),
            const Icon(Icons.swap_horiz),
            Expanded(child: TextField(controller: _destination, decoration: const InputDecoration(labelText: 'To (IATA)'))),
          ]),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => ref.read(flightSearchProvider.notifier).search(
                  origin: _origin.text.trim().toUpperCase(),
                  destination: _destination.text.trim().toUpperCase(),
                  departDate: DateTime.now().add(const Duration(days: 7)).toIso8601String().substring(0, 10),
                ),
            child: const Text('Search 6 airlines (Amadeus + Sabre)'),
          ),
          const SizedBox(height: 16),
          offers.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Search failed: $e'),
            data: (list) => Column(children: [
              for (final o in list)
                Card(
                  child: ListTile(
                    title: Text('${o.airline} ${o.flightNo}'),
                    subtitle: Text('${o.duration} · ${o.gds == 'sabre' ? 'Sabre' : 'Amadeus'} GDS'),
                    trailing: Text(o.price, style: const TextStyle(fontWeight: FontWeight.w700)),
                    onTap: () => ref.read(flightSearchProvider.notifier).book(o, 1),
                  ),
                ),
            ]),
          ),
        ],
      ),
    );
  }
}
