"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.cancelDialog;

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

type Props = {
  open: boolean;
  subscription: AdminSubscriptionRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

/**
 * Two-paragraph confirm: explains what happens (access kept until
 * period end), accepts an optional admin reason for the audit log.
 * Reason is optional but heavily encouraged — placeholder copy
 * primes admins to record context.
 */
export function CancelSubscriptionDialog({
  open,
  subscription,
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

  if (!subscription) return null;

  const until = subscription.currentPeriodEnd
    ? DATE_FMT.format(new Date(subscription.currentPeriodEnd))
    : null;
  const body = until
    ? T.body
        .replace("{user}", subscription.user.displayName)
        .replace("{plan}", subscription.plan.name)
        .replace("{until}", until)
    : T.bodyNoUntil
        .replace("{user}", subscription.user.displayName)
        .replace("{plan}", subscription.plan.name);

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
        <p className="text-sm text-text-main">{body}</p>
        <div>
          <label
            htmlFor="cancel-reason"
            className="mb-1.5 block text-xs font-medium text-text-sec"
          >
            {T.reasonLabel}
          </label>
          <Textarea
            id="cancel-reason"
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
