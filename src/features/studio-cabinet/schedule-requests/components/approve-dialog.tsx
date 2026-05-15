"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
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
    } catch {
      setError(E.approveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">
          {T.body.replace("{provider}", providerName)}
        </p>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
