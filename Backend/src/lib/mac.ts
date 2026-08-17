/**
 * MAC address normalisation. The Omada Open API documents client MAC
 * addresses in the form `AA-BB-CC-DD-EE-FF` (dash-separated, uppercase) -
 * see the `clientMac` path parameter description in omada-openapi.json.
 * Accepts the common alternate input forms (colon-separated, no separator)
 * a captive-portal redirect or manual entry might supply.
 */
export function normalizeMac(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) as string[]).join('-').toUpperCase();
}
