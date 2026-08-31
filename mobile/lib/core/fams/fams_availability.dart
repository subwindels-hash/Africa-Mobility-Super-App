import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';

/// FAMS — Feature Activation Management System (docs/28).
/// The mobile home only ever shows services the activation engine has switched
/// ON for the user's country/state/city/user-group. Admins change availability
/// at runtime; apps pick it up on the next availability refresh — no store
/// release, no forced upgrade.

const _kFallbackVerticals = <String, (String, String, Color)>{
  'transportation': ('Ride', '🚗', Color(0xFF17A558)),
  'logistics': ('Send', '📦', Color(0xFF0E7C86)),
  'travel': ('Fly', '✈️', Color(0xFF0E67A6)),
  'security': ('Protect', '🛡', Color(0xFF101828)),
  'aviation': ('Charter', '🚁', Color(0xFFC2932A)),
  'accommodation': ('Stay', '🏨', Color(0xFF0E67A6)),
  'roadside': ('Rescue', '🛠', Color(0xFFDC6803)),
  'corporate_services': ('Corporate', '🏢', Color(0xFF101828)),
};

/// A single service's activation state for a context.
class FamsServiceStatus {
  const FamsServiceStatus({required this.code, required this.available, this.value});
  final String code;
  final bool available;
  final String? value; // on | beta | off | hidden | maintenance
}

/// Provider: fetches GET /v1/service-availability?city=… through the shared
/// Dio client (auth + retry interceptors). Falls back to the ride tile only —
/// never to the full catalog — when the backend can't be reached, so a network
/// failure can never surface a deactivated service.
class FamsAvailabilityNotifier extends StateNotifier<AsyncValue<List<FamsServiceStatus>>> {
  FamsAvailabilityNotifier(this._ref) : super(const AsyncValue.loading());

  final Ref _ref;

  Future<void> load({String? city, String? country}) async {
    state = const AsyncValue.loading();
    try {
      final api = _ref.read(apiClientProvider);
      final res = await api.get<Map<String, dynamic>>('/v1/service-availability', query: {
        if (city != null) 'city': city,
        if (country != null) 'country': country,
      });
      final services = (res['services'] as List)
          .map((s) => FamsServiceStatus(code: s['service'] as String, available: s['available'] == true, value: s['value'] as String?))
          .toList();
      state = AsyncValue.data(services);
    } catch (e, st) {
      // Fail closed: only the always-on core vertical is shown.
      state = AsyncValue.data(
        [const FamsServiceStatus(code: 'transportation', available: true, value: 'on')],
      );
      debugPrint('FAMS availability fallback (fail closed): $e\n$st');
    }
  }
}

final famsAvailabilityProvider =
    StateNotifierProvider<FamsAvailabilityNotifier, AsyncValue<List<FamsServiceStatus>>>(
  (ref) => FamsAvailabilityNotifier(ref),
);

/// Tiles for the home launcher, filtered by FAMS availability.
List<(String, String, Color)> activeServiceTiles(List<FamsServiceStatus>? statuses) {
  if (statuses == null || statuses.isEmpty) {
    return [_kFallbackVerticals['transportation']!];
  }
  final tiles = <(String, String, Color)>[];
  for (final s in statuses) {
    final meta = _kFallbackVerticals[s.code];
    if (s.available && meta != null) tiles.add(meta);
  }
  return tiles.isEmpty ? [_kFallbackVerticals['transportation']!] : tiles;
}
