/**
 * WhatsApp Business API message templates (docs/26 §Admin — template manager).
 * Category/utility templates must be Meta-approved before use; variables use {{n}}.
 */
export interface WaTemplate {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  header?: string;
  body: string;
  buttons?: string[]; // QUICK_REPLY | URL | PHONE_NUMBER
}

export const TEMPLATES: WaTemplate[] = [
  {
    name: 'booking_confirmation', category: 'UTILITY', language: 'en',
    header: '✅ Booking confirmed',
    body: 'Your {{1}} from {{2}} to {{3}} is confirmed.\nDriver: {{4}}\nFare: {{5}} — protected in escrow.\nTrack: {{6}}',
    buttons: ['Track live', 'Share trip'],
  },
  {
    name: 'driver_enroute', category: 'UTILITY', language: 'en',
    body: '{{1}} is on the way 🚗\nVehicle: {{2}}\nETA: {{3}} min\nCall (number masked): {{4}}',
    buttons: ['Call driver', 'Share trip'],
  },
  {
    name: 'arrival_notification', category: 'UTILITY', language: 'en',
    body: 'Your driver has arrived at {{1}}. Pickup code: {{2}}',
  },
  {
    name: 'payment_confirmation', category: 'UTILITY', language: 'en',
    body: 'Payment of {{1}} received ✅ — held in escrow for booking {{2}}. Released to the vendor after completion.',
  },
  {
    name: 'otp_verification', category: 'AUTHENTICATION', language: 'en',
    body: '{{1}} is your AMSA verification code. Never share it.',
  },
  {
    name: 'order_update_logistics', category: 'UTILITY', language: 'en',
    body: '📦 Delivery {{1}}: {{2}}.\nNext stop: {{3}}. Recipient will show code {{4}} at handover.',
  },
  {
    name: 'escrow_released', category: 'UTILITY', language: 'en',
    body: 'Service completed ✅ — {{1}} released to vendor (commission & VAT settled). Receipt: {{2}}',
  },
  {
    name: 'promo_broadcast', category: 'MARKETING', language: 'en',
    body: '🎉 {{1}} — {{2}}. Valid till {{3}}. Reply BOOK to use it.',
    buttons: ['Book now'],
  },
];
