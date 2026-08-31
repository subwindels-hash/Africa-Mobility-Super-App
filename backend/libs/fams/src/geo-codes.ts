/** City code → state code mapping (Nigeria launch states) + phone→country. */
export const CITY_STATE: Record<string, string> = {
  'NG-LAG': 'NG-LA', 'NG-ABJ': 'NG-FCT', 'NG-PHC': 'NG-RI', 'NG-KAN': 'NG-KN',
  'NG-IBD': 'NG-OY', 'NG-ONI': 'NG-AN', 'NG-AWK': 'NG-AN', 'NG-ENU': 'NG-EN',
  'NG-BNI': 'NG-ED', 'NG-ASB': 'NG-DE',
};

export const STATE_NAMES: Record<string, string> = {
  'NG-LA': 'Lagos', 'NG-FCT': 'FCT Abuja', 'NG-RI': 'Rivers', 'NG-KN': 'Kano',
  'NG-OY': 'Oyo', 'NG-AN': 'Anambra', 'NG-EN': 'Enugu', 'NG-ED': 'Edo', 'NG-DE': 'Delta',
};

export function countryFromPhone(phone: string): string {
  if (phone.startsWith('+254') || phone.startsWith('254')) return 'KE';
  if (phone.startsWith('+233') || phone.startsWith('233')) return 'GH';
  return 'NG';
}
