/**
 * SINGLE SOURCE OF TRUTH for Omada endpoint paths (Omada Controller v5.15.x).
 *
 * These paths were extracted from the ONLINE API DOCUMENTATION of the installed
 * controller, available at https://{controller}/v3/api-docs (Swagger/OpenAPI
 * "Omada Open API" v0.1). They are authoritative for THIS controller version.
 *
 * Structure (verified):
 *   - API base path  : /openapi/v1
 *   - omadacId       : a PATH segment on authenticated calls:
 *                        /openapi/v1/{omadacId}/...
 *                      a QUERY parameter on the OAuth2 token endpoint:
 *                        POST /openapi/v1/oauth2/token?omadacId={omadacId}
 *   - Auth           : OAuth2 client-credentials (client_id / client_secret),
 *                      presented as `Authorization: Bearer <accessToken>`.
 *
 * Voucher endpoints follow the Omada "voucher-group" model. The paths below are
 * verified; the exact request/response schemas for creating vouchers/groups are
 * still to be confirmed from the spec before Phase 4 is implemented.
 */
export const OMADA_PATHS = {
  /** OAuth2 client-credentials token endpoint (VERIFIED). needs ?omadacId=. */
  token: '/openapi/v1/oauth2/token',

  /** List all sites (VERIFIED) - used as the "simple authenticated request" probe. */
  sites: (omadacId: string) => `/openapi/v1/${encodeURIComponent(omadacId)}/sites`,

  /** Get a single site (VERIFIED). */
  site: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}`,

  /** List clients on a site (VERIFIED). */
  siteClients: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients`,

  /** Hotspot client auth (VERIFIED path; used for the portal authentication flow). */
  hotspotClientAuth: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/clients/${encodeURIComponent(clientMac)}/auth`,

  /** Hotspot voucher groups (VERIFIED paths; schemas pending confirmation). */
  voucherGroups: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups`,
  voucherGroup: (omadacId: string, siteId: string, groupId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups/${encodeURIComponent(groupId)}`,
  vouchers: (omadacId: string, siteId: string, voucherId?: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/vouchers${voucherId ? `/${encodeURIComponent(voucherId)}` : ''}`,
} as const;