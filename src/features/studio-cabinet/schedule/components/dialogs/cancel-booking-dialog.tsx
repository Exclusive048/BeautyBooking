"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleV2.cancelDialog;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  bookingId: string;
  clientName: string;
  serviceTitle: string;
  open: boolean;
  onClose: () => void;
};

export function CancelBookingDialog({
  bookingId,
  clientName,
  serviceTitle,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setReason("");
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      setReason("");
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.cancel));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      submitVariant="danger"
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.bodyTemplate
          .replace("{client}", clientName || "—")
          .replace("{service}", serviceTitle)}
      </p>
      <label className="block">
        <FieldLabel>
          {T.reasonLabel}
        </FieldLabel>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={T.reasonPlaceholder}
          disabled={submitting}
          maxLength={500}
        />
      </label>
    </FormDialog>
  );
}
