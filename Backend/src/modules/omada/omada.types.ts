/**
 * Omada Open API types.
 *
 * These models are derived from the documented Omada Open API (OAuth2
 * client-credentials) envelope: every response is `{ code, message, result }`
 * where `code === 0` means success.
 */

export interface OmadaConfig {
  /** e.g. https://omada:8043 when running in Docker Compose, or https://<host>:8043 */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** omadacId identifying the Omada controller the app belongs to */
  omadaId: string;
  siteId?: string;
  timeoutMs: number;
  /** Buffer subtracted from the provider `expires_in` to avoid expiry races */
  tokenTtlSafetySeconds: number;
  /** Omada controllers use self-signed TLS certs; disable CA verification only for them */
  tlsRejectUnauthorized: boolean;
}

export interface OmadaTokenResult {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
}

/** Standard Omada API envelope. */
export interface OmadaEnvelope<T = unknown> {
  code: number;
  message?: string;
  msg?: string;
  result?: T;
}

export interface OmadaSite {
  id: string;
  name: string;
  type?: string;
  guid?: string;
  vendorId?: string;
}

export interface OmadaClientInfo {
  mac: string;
  ip?: string;
  hostname?: string;
  ssid?: string;
  apMac?: string;
  isGuest?: boolean;
  [key: string]: unknown;
}

/**
 * Voucher models.
 *
 * DO NOT rely on these field names yet - the exact Omada voucher schema must be
 * confirmed against the installed controller's Online API Documentation before
 * this milestone's successor (voucher provisioning) is implemented.
 * See omada.voucher.service.ts.
 */
export interface OmadaVoucher {
  id?: string;
  code?: string;
  username?: string;
  password?: string;
  [key: string]: unknown;
}