/**
 * SINGLE SOURCE OF TRUTH for Omada endpoint paths.
 *
 * IMPORTANT (Rule: never invent Omada API endpoints):
 * The paths below with a `VERIFIED` tag have been checked against the documented
 * Omada Open API (OAuth2 client-credentials, base path `/api/v1`). The token and
 * sites endpoints confirm the authentication + "simple authenticated request"
 * milestone.
 *
 * Voucher endpoints are intentionally left OUT until they are confirmed against
 * the Online API Documentation published by the installed controller. Adjust the
 * strings here (and only here) once verified; no Omada path is hard-coded
 * elsewhere in the application.
 */
export const OMADA_PATHS = {
  /** OAuth2 client-credentials token endpoint (VERIFIED against Omada Open API docs). */
  token: '/api/v1/auth/oauth2/token',

  /** List sites - used as the "simple authenticated request" connectivity probe (VERIFIED). */
  sites: '/api/v1/sites',

  /** List clients on a site (VERIFIED path shape; used for client service). */
  siteClients: (siteId: string) => `/api/v1/sites/${encodeURIComponent(siteId)}/clients`,

  // Voucher endpoints - PENDING verification against installed controller docs.
  // Expected shape (DO NOT rely on until confirmed):
  //   siteVouchers:        (siteId) => `/api/v1/sites/${siteId}/vouchers`,
  //   siteVoucher:         (siteId, voucherId) => `/api/v1/sites/${siteId}/vouchers/${voucherId}`,
} as const;