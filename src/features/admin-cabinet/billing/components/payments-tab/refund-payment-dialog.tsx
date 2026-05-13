"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { formatRublesFromKopeks } from "@/features/admin-cabinet/billing/lib/kopeks";
import { UI_TEXT } from "@/lib/ui/text";
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setSubmitting(false);
  }, [open]);

  if (!payment) return null;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-main">
          {T.body.replace("{amount}", formatRublesFromKopeks(payment.amountKopeks))}
        </p>
        <div>
          <label
            htmlFor="refund-reason"
            className="mb-1.5 block text-xs font-medium text-text-sec"
          >
            {T.reasonLabel}
          </label>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={T.reasonPlaceholder}
            rows={3}
            maxLength={500}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="danger" onClick={() => void submit()} disabled={submitting}>
            {T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
