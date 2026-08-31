import 'package:flutter/foundation.dart';
import 'package:amsa_app/main.dart';

/// Driver flavor entry point:
///   flutter run --dart-define=APP_FLAVOR=driver -t flavors/main_driver.dart
void main() {
  debugPrint('flavor: driver');
  mainDelegate(flavor: 'driver');
}
