import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppFlavor { customer, driver, rider }

class EnvConfig {
  const EnvConfig({
    required this.flavor,
    required this.apiBaseUrl,
    required this.realtimeUrl,
    required this.googleMapsKey,
  });

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String realtimeUrl;
  final String googleMapsKey;

  factory EnvConfig.fromEnvironment({String? flavorOverride}) {
    final flavorName = flavorOverride ?? const String.fromEnvironment('APP_FLAVOR', defaultValue: 'customer');
    final flavor = AppFlavor.values.firstWhere(
      (f) => f.name == flavorName,
      orElse: () => AppFlavor.customer,
    );
    const api = String.fromEnvironment('AMSA_API_URL',
        defaultValue: 'https://api.amsa.africa/v1');
    const realtime = String.fromEnvironment('AMSA_REALTIME_URL',
        defaultValue: 'https://realtime.amsa.africa');
    const mapsKey = String.fromEnvironment('AMSA_GOOGLE_MAPS_KEY', defaultValue: '');
    return EnvConfig(
      flavor: flavor,
      apiBaseUrl: api,
      realtimeUrl: realtime,
      googleMapsKey: mapsKey,
    );
  }
}

final envConfigProvider = Provider<EnvConfig>((ref) => throw UnimplementedError());
