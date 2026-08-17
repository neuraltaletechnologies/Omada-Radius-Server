/**
 * Tanzanian mobile phone number normalisation.
 *
 * Canonical stored form is E.164 without punctuation: `+255XXXXXXXXX` (12
 * digits after the `+`). Accepts the common local input forms customers type
 * on a captive-portal form:
 *   0712345678        -> +255712345678
 *   712345678         -> +255712345678
 *   255712345678      -> +255712345678
 *   +255 712 345 678  -> +255712345678
 *
 * Only mobile numbers (leading significant digit 6 or 7, per TCRA-allocated
 * ranges) are accepted - landline/short-code ranges are rejected since this
 * number is used for mobile-money push payments and SMS delivery.
 */
export function normalizeTzPhone(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  let national: string | null = null;
  if (digits.startsWith('255') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  }

  if (!national || national.length !== 9) return null;
  if (!/^[67]\d{8}$/.test(national)) return null;

  return `+255${national}`;
}

/** True when `raw` normalises to a valid Tanzanian mobile number. */
export function isValidTzPhone(raw: string): boolean {
  return normalizeTzPhone(raw) !== null;
}
