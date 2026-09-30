"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.mastersV2.revokeDialog;
const E = UI_TEXT.studioCabinet.mastersV2.errors;

type Props = {
  studioId: string;
  masterId: string;
  masterName: string;
  open: boolean;
  onClose: () => void;
};

/**
 * FIX-STUDIO-02 (F7) — revoke a still-pending master invite from the team
 * detail. Calls `DELETE /api/studio/masters/[id]?studioId=…` (same studioId
 * the pause/activate dialog uses); the server marks the invite `LEFT` and
 * removes the unclaimed stub, so on refresh the INVITED card disappears.
 */
export function RevokeInviteDialog({
  studioId,
  masterId,
  masterName,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/studio/masters/${masterId}?studioId=${encodeURIComponent(studioId)}`,
        { method: "DELETE" },
      );
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.revokeFailed));
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
        {T.bodyTemplate.replace("{name}", masterName)}
      </p>
    </FormDialog>
  );
}
