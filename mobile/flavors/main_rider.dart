import 'package:flutter/foundation.dart';
import 'package:amsa_app/main.dart';

/// Rider flavor entry point:
///   flutter run --dart-define=APP_FLAVOR=rider -t flavors/main_rider.dart
void main() {
  debugPrint('flavor: rider');
  mainDelegate(flavor: 'rider');
}
