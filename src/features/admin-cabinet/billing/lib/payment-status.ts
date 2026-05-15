import { BillingPaymentStatus } from "@prisma/client";
import { UI_TEXT } from "@/lib/ui/text";

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
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  destructive: "bg-red-500/12 text-red-700 dark:text-red-300",
  muted: "bg-bg-input text-text-sec",
  info: "bg-primary/12 text-primary",
};
