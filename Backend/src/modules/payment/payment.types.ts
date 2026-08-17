/**
 * Provider-agnostic payment abstraction (spec section 8). A concrete adapter
 * (FakePaymentProvider now; a real ClickPesa/Selcom/Azampay adapter later) is
 * selected purely from `PAYMENT_PROVIDER` - nothing in payment.service.ts or
 * the routes knows which one is active.
 *
 * IMPORTANT: no real adapter is implemented yet. Building one means encoding
 * that provider's exact push-payment request shape and webhook signature
 * scheme, which - like the Omada API - must come from that provider's own
 * documentation, not be guessed at.
 */

export type PaymentProviderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface CreatePaymentRequestInput {
  /** Our own unique reference; providers that support it should echo it back. */
  transactionReference: string;
  /** Smallest whole currency unit for TZS (no decimals). */
  amount: number;
  currency: string;
  /** E.164 Tanzanian mobile number, e.g. +255712345678. */
  phoneNumber: string;
  /** Where the provider should POST the async result. */
  callbackUrl?: string;
  description?: string;
}

export interface CreatePaymentRequestResult {
  /** The provider's own id for this transaction, if it assigns one up front. */
  providerTransactionId?: string;
  status: PaymentProviderStatus;
  raw?: unknown;
}

export interface PaymentStatusResult {
  status: PaymentProviderStatus;
  providerTransactionId?: string;
  raw?: unknown;
}

/** Everything needed to verify + interpret an inbound webhook call. */
export interface WebhookVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  /** Raw (unparsed) request body bytes - required for signature verification. */
  rawBody: Buffer;
}

export interface WebhookVerificationResult {
  valid: boolean;
  /** Reason verification failed, when `valid` is false (never includes secret material). */
  reason?: string;
  transactionReference?: string;
  providerTransactionId?: string;
  status?: PaymentProviderStatus;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  /** Initiate a mobile-money push request. */
  createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult>;
  /**
   * Poll fallback / defense-in-depth cross-check, keyed by OUR transaction
   * reference (not the provider's id) - this matches every provider that
   * exposes a "query by order reference" endpoint (e.g. ClickPesa's
   * `GET /third-parties/payments/{orderReference}`).
   */
  checkPaymentStatus(transactionReference: string): Promise<PaymentStatusResult>;
  /** Verify an inbound webhook's authenticity and extract its payload. */
  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
}
