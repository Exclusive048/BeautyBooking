"use client";

import { useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  providerName: string;
  onResolved: () => void;
};

const T = UI_TEXT.studioCabinet.scheduleRequests.approveDialog;
const E = UI_TEXT.studioCabinet.scheduleRequests.errors;

export function ApproveDialog({ open, onClose, requestId, providerName, onResolved }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const response = await fetch(`/api/studio/schedule/requests/${requestId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? E.approveFailed);
      return;
    }
    onResolved();
    onClose();
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.body.replace("{provider}", providerName)}
      </p>
    </FormDialog>
  );
}
