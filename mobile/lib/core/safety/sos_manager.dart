import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// SOS protocol (docs/07 §6): 2-tap or shake → incident with live location →
/// ops console alert ≤5min + response line dial + trusted contacts SMS.
class SosManager {
  SosManager(this._ref);

  final Ref _ref;
  String? _activeIncidentId;
  DateTime? _triggeredAt;

  bool get isActive => _activeIncidentId != null;

  Future<String> trigger({required String source}) async {
    if (isActive) return _activeIncidentId!;
    _triggeredAt = DateTime.utcNow();
    _activeIncidentId = 'inc_${DateTime.now().millisecondsSinceEpoch}';
    // 1. POST /v1/sos {bookingId, location, source}  → incident id
    // 2. open socket room `incident:{id}` for ops + trusted contacts fanout
    // 3. start foreground location stream @2s
    // 4. auto-dial response line via masked PSTN
    return _activeIncidentId!;
  }

  Future<void> resolve(String reason) async {
    // POST /v1/sos/{id}/resolve → clears room, stops streams, logs follow-up
    _activeIncidentId = null;
    _triggeredAt = null;
  }
}

final sosManagerProvider = Provider<SosManager>((ref) => SosManager(ref));
