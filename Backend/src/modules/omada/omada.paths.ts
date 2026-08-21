/**
 * SINGLE SOURCE OF TRUTH for Omada endpoint paths.
 *
 * Resource paths (sites/clients/hotspot/vouchers/...) were extracted from the
 * ONLINE API DOCUMENTATION of the installed controller, available at
 * https://{controller}/v3/api-docs (Swagger/OpenAPI "Omada Open API" v0.1).
 *
 * The TOKEN endpoint is NOT part of that `paths` listing - it's documented
 * separately in the "Open API Access Guide" embedded in the same spec at
 * `x-openapi.x-setting.homeCustomLocation`, and confirmed live against the
 * real controller (see Backend/README.md's live-verification section):
 *   POST /openapi/authorize/token?grant_type=client_credentials
 *   Content-Type: application/json
 *   Body: { omadacId, client_id, client_secret }   <- omadacId in the BODY here
 *   -> { accessToken, tokenType, expiresIn, refreshToken }
 * An earlier version of this file used a plausible-looking but NON-EXISTENT
 * `/openapi/v1/oauth2/token` path with a Bearer-style header - that path was
 * never in the spec and the controller's IpAccessRuleFilter silently
 * misparsed it, producing a confusing errorCode -7131 "Controller ID not
 * exist" instead of a clean 404. Lesson: grep the spec's raw `paths` keys
 * before trusting a "VERIFIED" comment.
 *
 * Structure (verified):
 *   - API base path  : /openapi/v1 (all RESOURCE endpoints below)
 *   - omadacId       : a PATH segment on every resource call:
 *                        /openapi/v1/{omadacId}/...
 *   - Auth           : client-credentials (client_id / client_secret),
 *                      presented as `Authorization: AccessToken=<accessToken>`
 *                      (NOT the standard `Bearer` scheme).
 *
 * Voucher endpoints follow the Omada "voucher-group" model; the request/response
 * schema (CreateVoucherGroupOpenApiVO etc.) is verified field-for-field against
 * `components.schemas` in the spec.
 */
export const OMADA_PATHS = {
  /** Client-credentials token endpoint (VERIFIED live). NOT under /openapi/v1. */
  token: '/openapi/authorize/token',

  /** List all sites (VERIFIED) - used as the "simple authenticated request" probe. */
  sites: (omadacId: string) => `/openapi/v1/${encodeURIComponent(omadacId)}/sites`,

  /** Get a single site (VERIFIED). */
  site: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}`,

  /** List clients on a site (VERIFIED). */
  siteClients: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients`,

  /** Single client (VERIFIED). */
  client: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientMac)}`,

  /** Block / unblock a client (VERIFIED). */
  clientBlock: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientMac)}/block`,
  clientUnblock: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientMac)}/unblock`,

  /** Hotspot client auth (VERIFIED path; used for the portal authentication flow). */
  hotspotClientAuth: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/clients/${encodeURIComponent(clientMac)}/auth`,

  /** Hotspot client de-authorisation (VERIFIED path). */
  hotspotClientUnauth: (omadacId: string, siteId: string, clientMac: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/clients/${encodeURIComponent(clientMac)}/unauth`,

  /** Hotspot voucher groups (VERIFIED paths; schemas pending confirmation). */
  voucherGroups: (omadacId: string, siteId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups`,
  voucherGroup: (omadacId: string, siteId: string, groupId: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups/${encodeURIComponent(groupId)}`,
  vouchers: (omadacId: string, siteId: string, voucherId?: string) =>
    `/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/hotspot/vouchers${voucherId ? `/${encodeURIComponent(voucherId)}` : ''}`,
} as const;