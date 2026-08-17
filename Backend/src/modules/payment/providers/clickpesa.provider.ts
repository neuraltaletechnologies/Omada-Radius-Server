import { timingSafeEqual } from 'node:crypto';
import { fetch } from 'undici';
import type { Logger } from '../../../lib/logger.js';
import { PaymentProviderError } from '../../../lib/errors.js';
import type {
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  PaymentProvider,
  PaymentProviderStatus,
  PaymentStatusResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '../payment.types.js';
import { computeClickPesaChecksum } from './clickpesa.checksum.js';

export interface ClickPesaConfig {
  /** https://api.clickpesa.com */
  baseUrl: string;
  clientId: string;
  apiKey: string;
  /** Only present/required if checksums are enabled for this merchant account in the ClickPesa dashboard. */
  checksumSecret?: string;
  timeoutMs: number;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

/**
 * ClickPesa's documented statuses (docs.clickpesa.com) collapsed onto ours.
 * SETTLED (funds settled to the merchant) counts as SUCCESS for our purposes
 * - the customer already paid by the time a push request reaches PROCESSING
 * -> SUCCESS, settlement is a later back-office step.
 */
const STATUS_MAP: Record<string, PaymentProviderStatus> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  SETTLED: 'SUCCESS',
  FAILED: 'FAILED',
};

/**
 * Real ClickPesa mobile-money (USSD-PUSH) adapter. Every endpoint/field name
 * below comes directly from docs.clickpesa.com - none of it is guessed:
 *  - POST /third-parties/generate-token                        (client-id/api-key headers -> JWT, 1h TTL)
 *  - POST /third-parties/payments/initiate-ussd-push-request    (Bearer)
 *  - GET  /third-parties/payments/{orderReference}              (Bearer)
 *  - Webhook (dashboard-configured URL): POST { event, data }; checksum
 *    verification per docs.clickpesa.com/home/checksum (same algorithm as
 *    outgoing requests).
 */
export class ClickPesaProvider implements PaymentProvider {
  readonly name = 'clickpesa';
  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly cfg: ClickPesaConfig,
    private readonly logger: Logger,
  ) {
    if (!cfg.checksumSecret) {
      this.logger.warn(
        { event: 'payment.clickpesa.checksum_disabled' },
        'CLICKPESA_CHECKSUM_SECRET is not set - outgoing requests are unsigned and inbound webhooks cannot be authenticated. Enable checksums in the ClickPesa dashboard before going to production.',
      );
    }
  }

  /**
   * Auth-only connectivity check (no money movement): proves Client
   * ID/API Key are valid by obtaining a token. Used by
   * `npm run clickpesa:connect` and never by the payment flow itself.
   */
  async verifyCredentials(): Promise<void> {
    await this.getToken();
  }

  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
    const token = await this.getToken();
    const body: Record<string, unknown> = {
      amount: String(input.amount),
      currency: input.currency,
      orderReference: input.transactionReference,
      phoneNumber: toClickPesaPhone(input.phoneNumber),
    };
    if (this.cfg.checksumSecret) {
      body.checksum = computeClickPesaChecksum(body, this.cfg.checksumSecret);
    }

    const res = await this.request('/third-parties/payments/initiate-ussd-push-request', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await this.parseJson(res);
    if (!res.ok) {
      throw new PaymentProviderError('ClickPesa push request failed', {
        httpStatus: res.status,
        message: payload.message,
      });
    }

    const status = STATUS_MAP[String(payload.status)] ?? 'PROCESSING';
    this.logger.info(
      {
        event: 'payment.clickpesa.push_requested',
        providerTransactionId: payload.id,
        orderReference: input.transactionReference,
        channel: payload.channel,
        status,
      },
      'ClickPesa USSD-PUSH request sent',
    );
    return {
      providerTransactionId: typeof payload.id === 'string' ? payload.id : undefined,
      status,
      raw: payload,
    };
  }

  async checkPaymentStatus(transactionReference: string): Promise<PaymentStatusResult> {
    const token = await this.getToken();
    const res = await this.request(`/third-parties/payments/${encodeURIComponent(transactionReference)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return { status: 'FAILED' };

    const payload = await this.parseJson(res);
    const list = Array.isArray(payload) ? payload : [];
    const first = list[0] as Record<string, unknown> | undefined;
    if (!res.ok || !first) return { status: 'FAILED', raw: payload };

    return {
      status: STATUS_MAP[String(first.status)] ?? 'PROCESSING',
      providerTransactionId: typeof first.id === 'string' ? first.id : undefined,
      raw: first,
    };
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    let payload: { event?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      return { valid: false, reason: 'invalid_json' };
    }

    if (this.cfg.checksumSecret) {
      const claimed = (payload as Record<string, unknown>).checksum;
      if (typeof claimed !== 'string' || !this.isValidChecksum(payload, claimed)) {
        return { valid: false, reason: 'invalid_checksum' };
      }
    } else {
      this.logger.warn(
        { event: 'payment.clickpesa.webhook.unverified' },
        'ClickPesa webhook accepted without checksum verification (CLICKPESA_CHECKSUM_SECRET not set)',
      );
    }

    const data = payload.data ?? {};
    const status: PaymentProviderStatus | undefined =
      payload.event === 'PAYMENT RECEIVED'
        ? 'SUCCESS'
        : payload.event === 'PAYMENT FAILED'
          ? 'FAILED'
          : STATUS_MAP[String(data.status)];

    const transactionReference = data.orderReference;
    if (typeof transactionReference !== 'string' || !status) {
      return { valid: false, reason: 'unrecognised_event' };
    }

    return {
      valid: true,
      transactionReference,
      providerTransactionId: typeof data.id === 'string' ? data.id : undefined,
      status,
      raw: payload,
    };
  }

  private isValidChecksum(payload: Record<string, unknown>, claimed: string): boolean {
    const expected = computeClickPesaChecksum(payload, this.cfg.checksumSecret!);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(claimed, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token;

    const res = await this.request('/third-parties/generate-token', {
      method: 'POST',
      headers: { 'client-id': this.cfg.clientId, 'api-key': this.cfg.apiKey },
    });
    const payload = await this.parseJson(res);
    if (!res.ok || typeof payload.token !== 'string') {
      throw new PaymentProviderError('ClickPesa token generation failed', {
        httpStatus: res.status,
        message: payload.message,
      });
    }

    // Docs: token is valid for 1 hour - cache with a safety margin.
    this.tokenCache = { token: payload.token, expiresAt: Date.now() + 55 * 60 * 1000 };
    this.logger.info({ event: 'payment.clickpesa.token_obtained' }, 'Obtained ClickPesa access token');
    return payload.token;
  }

  private async request(path: string, init: { method?: string; headers: Record<string, string>; body?: string }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      return await fetch(`${this.cfg.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new PaymentProviderError(aborted ? 'ClickPesa request timed out' : 'Failed to reach ClickPesa', {
        cause: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson(res: Response): Promise<Record<string, unknown>> {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function toClickPesaPhone(e164: string): string {
  // ClickPesa expects the number without the leading '+' (e.g. 255712345678).
  return e164.replace(/^\+/, '');
}
