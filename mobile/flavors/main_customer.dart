import 'package:flutter/foundation.dart';
import 'package:amsa_app/main.dart';

/// Customer flavor entry point:
///   flutter run --dart-define=APP_FLAVOR=customer -t flavors/main_customer.dart
void main() {
  debugPrint('flavor: customer');
  mainDelegate(flavor: 'customer');
}
