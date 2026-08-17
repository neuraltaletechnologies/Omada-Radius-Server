/**
 * SMS content templates (spec section 16). Kept centralised and configurable
 * rather than inlined at call sites.
 */
export interface VoucherSmsContext {
  packageName: string;
  amount: number;
  currency: string;
  voucherCode: string;
}

export function renderVoucherReadySms(ctx: VoucherSmsContext): string {
  return (
    `Changia WiFi: Payment of ${ctx.currency} ${ctx.amount} successful. ` +
    `Your ${ctx.packageName} Internet package is active. ` +
    `Voucher: ${ctx.voucherCode}. Enjoy your Internet.`
  );
}
