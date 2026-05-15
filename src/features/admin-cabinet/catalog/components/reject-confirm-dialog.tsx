"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.catalog.rejectDialog;

type Props = {
  open: boolean;
  categoryName: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

const MIN_LEN = 3;
const MAX_LEN = 500;

/** Required-reason rejection dialog. Reason is currently logged on
 * the server (no schema column yet — see BACKLOG.md), but we still
 * require it at UX-level so admins build the habit of writing
 * justifications before the column lands. */
export function RejectConfirmDialog({
  open,
  categoryName,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_LEN) {
      setError(T.errorMinLength);
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(T.errorMaxLength);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">
          <span className="font-medium text-text-main">{categoryName}</span>
          {" — "}
          {T.description}
        </p>
        <div>
          <label
            htmlFor="reject-reason"
            className="mb-1.5 block text-xs font-medium text-text-sec"
          >
            {T.reasonLabel}
          </label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            placeholder={T.reasonPlaceholder}
            rows={4}
            maxLength={MAX_LEN}
          />
          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
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
