import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/config/env_config.dart';

/// Bootstrap: flavor via --dart-define=APP_FLAVOR=customer|driver|rider
void main() => mainDelegate();

/// Flavor-aware bootstrap shared by lib/main.dart and flavors/* entry points.
void mainDelegate({String? flavor}) {
  WidgetsFlutterBinding.ensureInitialized();
  final config = EnvConfig.fromEnvironment(flavorOverride: flavor);
  runApp(
    ProviderScope(
      overrides: [envConfigProvider.overrideWith((ref) => config)],
      child: const AmsaApp(),
    ),
  );
}
