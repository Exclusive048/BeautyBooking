"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";

const T = UI_TEXT.adminPanel.billing.cancelDialog;

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

  useEffect(() => {
    if (!open) return;
    // Reset the form when the dialog re-opens for a different subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("");
  }, [open]);

  if (!subscription) return null;

  const until = subscription.currentPeriodEnd
    ? UI_FMT.date(subscription.currentPeriodEnd, "dayMonthYearLong", { timeZone: VIEWER_TZ })
    : null;
  const body = until
    ? T.body
        .replace("{user}", subscription.user.displayName)
        .replace("{plan}", subscription.plan.name)
        .replace("{until}", until)
    : T.bodyNoUntil
        .replace("{user}", subscription.user.displayName)
        .replace("{plan}", subscription.plan.name);

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
      <p className="text-sm text-text-main">{body}</p>
      <div>
        <FieldLabel htmlFor="cancel-reason" tone="muted">
          {T.reasonLabel}
        </FieldLabel>
        <Textarea
          id="cancel-reason"
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
