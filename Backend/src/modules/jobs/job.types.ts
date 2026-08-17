/** Background job types (spec section 23). One handler per type in job.runner.ts. */
export const JOB_TYPES = {
  PROVISION_VOUCHER: 'PROVISION_VOUCHER',
  SEND_VOUCHER_SMS: 'SEND_VOUCHER_SMS',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export interface ProvisionVoucherPayload {
  paymentId: string;
}

export interface SendVoucherSmsPayload {
  paymentId: string;
}
