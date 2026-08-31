# AMSA Flutter Apps

One codebase → three apps (flavors): **customer**, **driver**, **rider**.
Full architecture: `docs/11-flutter-architecture.md`.

```
mobile/
├── lib/
│   ├── main.dart                    # flavor bootstrap (dart-define=APP_FLAVOR=customer|driver|rider)
│   ├── app.dart                     # MaterialApp.router + theme + localizations
│   ├── core/
│   │   ├── config/env_config.dart   # API URLs, feature flags per flavor
│   │   ├── network/api_client.dart  # Dio + auth/idempotency/retry interceptors
│   │   ├── realtime/socket_service.dart
│   │   ├── location/location_service.dart
│   │   ├── safety/sos_manager.dart  # shake detect → incident → masked call
│   │   ├── theme/amsa_theme.dart    # design tokens (docs/15)
│   │   └── i18n/                    # arb: en, ha, yo, ig, pcm
│   └── features/
│       ├── auth/  home/  ride/  logistics/  travel/  security_services/
│       ├── booking_common/  wallet/  chat/  safety/  loyalty/  account/
│       ├── driver_console/          # driver flavor only
│       └── rider_console/           # rider flavor only
└── flavors/ customer/ driver/ rider/   # entry points, icons, splash
```

Run:
```bash
flutter run --dart-define=APP_FLAVOR=customer
flutter run --dart-define=APP_FLAVOR=driver
flutter run --dart-define=APP_FLAVOR=rider
```
