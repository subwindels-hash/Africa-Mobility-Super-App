import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Ride booking screen (wireframe C-04): class selector + fare estimate + confirm.
class RideBookingScreen extends ConsumerWidget {
  const RideBookingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estimate = ref.watch(fareEstimateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Book a ride')),
      body: Column(children: [
        Expanded(
          child: Container(
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AmsaMapColors.mapSurface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE4E7EC)),
            ),
            child: const Center(
              child: Text('▓▓ live map (Google → OSM fallback) ▓▓',
                  style: TextStyle(color: Color(0xFF475467))),
            ),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SizedBox(
                height: 96,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: const [
                    _ClassCard(label: 'Economy', eta: '4 min', price: '₦6–7k', selected: true),
                    _ClassCard(label: 'Standard', eta: '6 min', price: '₦9–11k'),
                    _ClassCard(label: 'Premium', eta: '8 min', price: '₦14–17k'),
                    _ClassCard(label: 'VIP', eta: '9 min', price: '₦19–24k'),
                    _ClassCard(label: 'SUV', eta: '10 min', price: '₦22–28k'),
                    _ClassCard(label: 'Chauffeur', eta: '15 min', price: '₦60k+'),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(children: [
                const Icon(Icons.bolt, size: 16, color: Color(0xFF1570EF)),
                const SizedBox(width: 6),
                Text('Demand high · ${estimate.surge}× (capped 2.0×)',
                    style: const TextStyle(fontSize: 13, color: Color(0xFF475467))),
                const Spacer(),
                const Text('🔒 Escrow protected', style: TextStyle(fontSize: 13, color: Color(0xFF17A558))),
              ]),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {},
                child: Text('Confirm Economy · ${estimate.range}'),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _ClassCard extends StatelessWidget {
  final String label;
  final String eta;
  final String price;
  final bool selected;
  const _ClassCard({required this.label, required this.eta, required this.price, this.selected = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 132,
      margin: const EdgeInsets.only(right: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFE3F7EB) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: selected ? const Color(0xFF17A558) : const Color(0xFFE4E7EC),
          width: selected ? 2 : 1,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        Text(eta, style: const TextStyle(fontSize: 12, color: Color(0xFF475467))),
        const Spacer(),
        Text(price, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF17A558))),
      ]),
    );
  }
}

class AmsaMapColors {
  static const mapSurface = Color(0xFFEDF3EE);
}

class FareEstimate {
  final String range;
  final String surge;
  const FareEstimate(this.range, this.surge);
}

final fareEstimateProvider = Provider<FareEstimate>((ref) => const FareEstimate('₦6,200 – ₦7,400', '1.2'));
