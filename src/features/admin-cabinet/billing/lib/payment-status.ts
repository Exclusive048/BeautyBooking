import { BillingPaymentStatus } from "@/lib/prisma-enums";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.billing.payments.status;

export type PaymentStatusTone =
  | "success"
  | "warning"
  | "destructive"
  | "muted"
  | "info";

/** Maps a Prisma `BillingPaymentStatus` to the {label, tone} pair the
 * status pill needs. Tone names mirror the catalog conventions used
 * elsewhere in the admin cabinet so the pill colour stays consistent
 * across surfaces. */
export function paymentStatusDisplay(
  status: BillingPaymentStatus,
): { label: string; tone: PaymentStatusTone } {
  switch (status) {
    case BillingPaymentStatus.PENDING:
      return { label: T.pending, tone: "warning" };
    case BillingPaymentStatus.SUCCEEDED:
      return { label: T.succeeded, tone: "success" };
    case BillingPaymentStatus.FAILED:
      return { label: T.failed, tone: "destructive" };
    case BillingPaymentStatus.CANCELED:
      return { label: T.canceled, tone: "muted" };
    case BillingPaymentStatus.REFUNDED:
      return { label: T.refunded, tone: "info" };
  }
}

export const PAYMENT_STATUS_TONE_CLASS: Record<PaymentStatusTone, string> = {
  success: "bg-success/[0.12] text-success-text",
  warning: "bg-warning/[0.12] text-warning-text",
  destructive: "bg-destructive/[0.12] text-danger-text",
  muted: "bg-bg-input text-text-sec",
  info: "bg-primary/[0.12] text-accent-text",
};
