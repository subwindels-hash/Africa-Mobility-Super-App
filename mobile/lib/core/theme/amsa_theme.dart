import 'package:flutter/material.dart';

/// AMSA design tokens (docs/15-design-system.md).
class AmsaColors {
  static const green900 = Color(0xFF0B3D2E);
  static const green700 = Color(0xFF146B4A);
  static const green500 = Color(0xFF17A558); // primary
  static const green100 = Color(0xFFE3F7EB);
  static const gold600 = Color(0xFFC2932A);
  static const teal500 = Color(0xFF0E7C86);
  static const sky500 = Color(0xFF0E67A6);
  static const slate900 = Color(0xFF101828);
  static const slate600 = Color(0xFF475467);
  static const slate200 = Color(0xFFE4E7EC);
  static const slate50 = Color(0xFFF9FAFB);
  static const danger600 = Color(0xFFD92D20); // SOS only
}

class AmsaTheme {
  static ThemeData light() => _base(Brightness.light);
  static ThemeData dark() => _base(Brightness.dark);

  static ThemeData _base(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AmsaColors.green500,
      brightness: brightness,
      primary: AmsaColors.green500,
      secondary: AmsaColors.gold600,
      error: AmsaColors.danger600,
      surface: isLight ? Colors.white : const Color(0xFF0C111D),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: isLight ? AmsaColors.slate50 : const Color(0xFF0C111D),
      fontFamily: 'Inter',
      textTheme: const TextTheme(
        displayLarge: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w800),
        headlineMedium: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700),
        titleMedium: TextStyle(fontWeight: FontWeight.w600),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AmsaColors.green500,
          foregroundColor: Colors.white,
          minimumSize: const Size(64, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isLight ? Colors.white : const Color(0xFF161E2C),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AmsaColors.slate200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AmsaColors.slate200),
        ),
      ),
      cardTheme: CardTheme(
        elevation: 0,
        color: isLight ? Colors.white : const Color(0xFF161E2C),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AmsaColors.slate200),
        ),
      ),
    );
  }
}
