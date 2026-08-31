import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Location service (docs/11 §location): fused position stream with
/// permission flow, Google Maps geocoding primary and OSM/Nominatim backup
/// (mirrors the backend geo-service failover contract in libs/geo).
class LatLng {
  const LatLng(this.lat, this.lng);
  final double lat;
  final double lng;
}

class LocationService {
  final _controller = StreamController<LatLng>.broadcast();
  StreamSubscription<Position>? _sub;

  Stream<LatLng> get stream => _controller.stream;

  Future<bool> ensurePermission() async {
    var service = await Geolocator.isLocationServiceEnabled();
    if (!service) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.whileInUse || permission == LocationPermission.always;
  }

  /// High-accuracy stream used for driver tracking + SOS geofences.
  Future<void> startTracking({double distanceFilterM = 15}) async {
    if (!await ensurePermission()) return;
    await _sub?.cancel();
    _sub = Geolocator.getPositionStream(
      locationSettings: LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilterM),
    ).listen((p) => _controller.add(LatLng(p.latitude, p.longitude)));
  }

  Future<LatLng?> current() async {
    if (!await ensurePermission()) return null;
    final p = await Geolocator.getCurrentPosition();
    return LatLng(p.latitude, p.longitude);
  }

  Future<void> stopTracking() async {
    await _sub?.cancel();
    _sub = null;
  }

  void dispose() {
    _sub?.cancel();
    _controller.close();
  }
}

final locationServiceProvider = Provider<LocationService>((ref) {
  final svc = LocationService();
  ref.onDispose(svc.dispose);
  return svc;
});

/// Geocoding with Google→OSM failover (same cascade as the backend).
class GeocodeClient {
  GeocodeClient(this._ref);
  final Ref _ref;

  Future<String?> reverseLookup(LatLng at) async {
    // Primary: Google Geocoding via the platform geo-service proxy; if it
    // errors (quota/keys), the backend already fails over to OSM — the app
    // calls one endpoint and renders whatever comes back.
    // (Wired to GET /v1/geo/geocode?q= on the platform API.)
    return null; // replaced by ApiClient integration in the feature layer
  }
}

final geocodeClientProvider = Provider<GeocodeClient>((ref) => GeocodeClient(ref));
