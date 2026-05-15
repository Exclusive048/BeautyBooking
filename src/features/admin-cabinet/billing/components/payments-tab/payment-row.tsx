"use client";

import { Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRublesFromKopeks } from "@/features/admin-cabinet/billing/lib/kopeks";
import {
  PAYMENT_STATUS_TONE_CLASS,
  paymentStatusDisplay,
} from "@/features/admin-cabinet/billing/lib/payment-status";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPaymentRow } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.payments;
const M = UI_TEXT.adminPanel.billing.methodFallback;

const DT_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  payment: AdminPaymentRow;
  busy: boolean;
  onRefund: () => void;
};

/** Single payment row used in both pending and history groups.
 * Refund icon-button renders only when `isRefundable` (i.e. SUCCEEDED
 * + has YooKassa id). */
export function PaymentTableRow({ payment, busy, onRefund }: Props) {
  const status = paymentStatusDisplay(payment.status);
  return (
    <tr className="hover:bg-bg-input/40">
      <td className="px-4 py-3 align-top font-mono text-[11px] text-text-sec">
        {payment.displayId}
      </td>
      <td className="px-4 py-3 align-top text-xs tabular-nums text-text-sec">
        {DT_FMT.format(new Date(payment.createdAt))}
      </td>
      <td className="px-4 py-3 align-top text-sm text-text-main">
        {payment.user?.displayName ?? M}
      </td>
      <td className="px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-text-main">
        {formatRublesFromKopeks(payment.amountKopeks)}
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            PAYMENT_STATUS_TONE_CLASS[status.tone],
          )}
        >
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-xs text-text-sec">
        {payment.paymentMethodDisplay ?? M}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {payment.isRefundable ? (
          <button
            type="button"
            onClick={onRefund}
            disabled={busy}
            aria-label={T.refundButton}
            title={T.refundButton}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-bg-input text-text-sec transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-300"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
