"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { UI_TEXT } from "@/lib/ui/text";

const TPause = UI_TEXT.studioCabinet.mastersV2.pauseDialog;
const TActivate = UI_TEXT.studioCabinet.mastersV2.activateDialog;
const E = UI_TEXT.studioCabinet.mastersV2.errors;

type Props = {
  studioId: string;
  masterId: string;
  masterName: string;
  mode: "pause" | "activate";
  open: boolean;
  onClose: () => void;
};

export function PauseMasterDialog({
  studioId,
  masterId,
  masterName,
  mode,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const T = mode === "pause" ? TPause : TActivate;

  function handleClose() {
    if (submitting) return;
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/masters/${masterId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          isActive: mode === "activate",
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.actionFailed);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(E.actionFailed);
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
      submitVariant={mode === "pause" ? "secondary" : "primary"}
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.bodyTemplate.replace("{name}", masterName)}
      </p>
    </FormDialog>
  );
}
