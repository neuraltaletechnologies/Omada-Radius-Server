/**
 * Provider-agnostic SMS abstraction (spec section 15). A concrete adapter is
 * selected purely from `SMS_PROVIDER`; nothing in sms.service.ts knows which
 * one is active.
 */
export interface SendSmsInput {
  /** E.164 phone number. */
  to: string;
  message: string;
  /** Optional sender id / short code, defaults to SMS_SENDER_ID. */
  senderId?: string;
}

export interface SendSmsResult {
  success: boolean;
  providerMessageId?: string;
  raw?: unknown;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}
