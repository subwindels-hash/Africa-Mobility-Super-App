import 'package:flutter/material.dart';

/// Offline-first string catalog for the 5 mandated languages:
/// English, Hausa, Yoruba, Igbo, Nigerian Pidgin (docs/26 §languages).
/// The .arb files under this directory feed flutter_localizations for
/// framework strings; these maps carry AMSA product copy so the whole app
/// ships fully localized day one.
class AmsaStrings {
  static const locales = ['en', 'ha', 'yo', 'ig', 'pcm'];

  static const _catalog = <String, Map<String, String>>{
    'en': {
      'home.greeting': 'Good morning',
      'home.search': 'Where to? What to send? Where to fly?',
      'home.loyalty': '{tier} ⭐ · {points} pts',
      'ride.book': 'Book a ride',
      'ride.confirm': 'Confirm ride',
      'ride.eta': 'Driver arrives in {min} min',
      'send.book': 'Send a package',
      'fly.search': 'Search flights',
      'wallet.balance': 'Available balance',
      'wallet.topup': 'Top up',
      'wallet.send': 'Send money',
      'safety.sos': 'Emergency SOS',
      'chat.title': 'Chat',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.loading': 'Loading…',
    },
    'ha': {
      'home.greeting': 'Barka da safiya',
      'home.search': 'Ina kake zuwa? Me kake aika? Ina zama?',
      'home.loyalty': '{tier} ⭐ · maki {points}',
      'ride.book': 'Booki hawa',
      'ride.confirm': 'Tabbatar da hawa',
      'ride.eta': 'Diba ya isa cikin minti {min}',
      'send.book': 'Aika kaya',
      'fly.search': 'Neman jirgi',
      'wallet.balance': 'Ma\'aikatar kudi',
      'wallet.topup': 'Karɓa da kudi',
      'wallet.send': 'Aika kudi',
      'safety.sos': 'Agogon gaggawa',
      'chat.title': 'Tattaunawa',
      'common.cancel': 'Soke',
      'common.confirm': 'Tabbatar',
      'common.loading': 'Ana loda…',
    },
    'yo': {
      'home.greeting': 'Ẹ káàárọ̀',
      'home.search': 'Nibo ni o nlọ? Kini o nfiranṣẹ?',
      'home.loyalty': '{tier} ⭐ · awọn iṣẹ {points}',
      'ride.book': 'Ọkọ̀ iṣẹ́',
      'ride.confirm': 'Fọwọ́ sí i',
      'ride.eta': 'Olùṣàkósọ dé ní iṣẹjú {min}',
      'send.book': 'Fi ọkọ̀ ránṣẹ',
      'fly.search': 'Ṣàwárí ọkọ̀ oju-ọrun',
      'wallet.balance': 'Owo ti o wa',
      'wallet.topup': 'Fi owo kun',
      'wallet.send': 'Fi owo ránṣẹ',
      'safety.sos': 'Ígbà pàjáwìrì',
      'chat.title': 'Ọ̀rọ̀',
      'common.cancel': 'Fagilé',
      'common.confirm': 'Fọwọ́ sí i',
      'common.loading': 'Ìgbà ìṣẹ…',
    },
    'ig': {
      'home.greeting': 'Ụtụtụ ọma',
      'home.search': 'Ebee ka ị na-aga? Gịnị ka ị na-ezitere?',
      'home.loyalty': '{tier} ⭐ · akara {points}',
      'ride.book': 'Debe ụgbọ',
      'ride.confirm': 'Kwado njem',
      'ride.eta': 'Onye ọkwọ ụgbọ ga-eru n\'ogoji {min}',
      'send.book': 'Zipu ngwongwo',
      'fly.search': 'Chọọ ụgbọ elu',
      'wallet.balance': 'Ego dị',
      'wallet.topup': 'Jupụta ego',
      'wallet.send': 'Zipu ego',
      'safety.sos': 'Mberede',
      'chat.title': 'Mkparịta ụka',
      'common.cancel': 'Kagbuo',
      'common.confirm': 'Kwado',
      'common.loading': 'Na-ebuga…',
    },
    'pcm': {
      'home.greeting': 'How far, good morning',
      'home.search': 'Where you dey go? Wetin you wan send?',
      'home.loyalty': '{tier} ⭐ · {points} points',
      'ride.book': 'Book ride',
      'ride.confirm': 'Confirm ride',
      'ride.eta': 'Driver go reach for {min} minutes',
      'send.book': 'Send package',
      'fly.search': 'Find flight',
      'wallet.balance': 'Wetin dey your wallet',
      'wallet.topup': 'Top up',
      'wallet.send': 'Send money',
      'safety.sos': 'Emergency SOS',
      'chat.title': 'Chat',
      'common.cancel': 'Cancel am',
      'common.confirm': 'Confirm am',
      'common.loading': 'E dey load…',
    },
  };

  static String of(BuildContext context, String key, [Map<String, String>? vars]) {
    final lang = Localizations.maybeLocaleOf(context)?.languageCode ?? 'en';
    var text = (_catalog[lang] ?? _catalog['en'])![key] ?? _catalog['en']![key] ?? key;
    vars?.forEach((k, v) => text = text.replaceAll('{$k}', v));
    return text;
  }
}
