import { createHmac } from 'node:crypto';

/**
 * ClickPesa checksum algorithm, as documented at docs.clickpesa.com/home/checksum:
 *  1. Remove `checksum` and `checksumMethod` from the payload.
 *  2. Recursively sort all object keys alphabetically at every nesting level.
 *  3. Serialise to compact JSON (no whitespace).
 *  4. HMAC-SHA256 with the merchant checksum secret.
 *  5. Hex-encode (64 chars).
 * Used both to sign outgoing requests (when checksums are enabled for the
 * merchant account) and to verify incoming webhook payloads.
 */
export function computeClickPesaChecksum(payload: Record<string, unknown>, secret: string): string {
  const { checksum: _checksum, checksumMethod: _checksumMethod, ...rest } = payload;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}
