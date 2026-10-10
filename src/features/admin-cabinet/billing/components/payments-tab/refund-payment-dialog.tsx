"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { moneyRUBFromKopeks } from "@/lib/format";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminPaymentRow } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.refundDialog;

type Props = {
  open: boolean;
  payment: AdminPaymentRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

/**
 * Refund confirm. Refund endpoint already has idempotency built in
 * (idempotenceKey based on YooKassa payment id + time bucket), so a
 * double-click client-side just means two identical calls to YooKassa
 * — they collapse to one refund. We still disable the button while
 * submitting for a cleaner UX.
 */
export function RefundPaymentDialog({
  open,
  payment,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset the form when the dialog re-opens for a different payment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("");
  }, [open]);

  if (!payment) return null;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      submitVariant="danger"
      onSubmit={() => onConfirm(reason.trim())}
    >
      <p className="text-sm text-text-main">
        {T.body.replace("{amount}", moneyRUBFromKopeks(payment.amountKopeks))}
      </p>
      <div>
        <FieldLabel htmlFor="refund-reason" tone="muted">
          {T.reasonLabel}
        </FieldLabel>
        <Textarea
          id="refund-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={T.reasonPlaceholder}
          rows={3}
          maxLength={500}
        />
      </div>
    </FormDialog>
  );
}
