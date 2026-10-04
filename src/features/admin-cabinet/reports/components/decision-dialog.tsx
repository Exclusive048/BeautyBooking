"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.reports;

export type ReportDecisionKind = "resolve" | "dismiss";

type Props = {
  kind: ReportDecisionKind | null;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
};

const NOTE_MAX = 1000;

/**
 * Решение по жалобе с пометкой для журнала. «Принять меры» — пометка
 * обязательна (что сделано), «Отклонить» — по желанию.
 */
export function ReportDecisionDialog({ kind, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    // Новое открытие — чистая форма.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote("");
    setError(null);
  }, [kind]);

  if (!kind) return null;
  const copy = kind === "resolve" ? T.resolveDialog : T.dismissDialog;
  const inputId = `report-decision-note-${kind}`;

  return (
    <FormDialog
      open
      onClose={onClose}
      title={copy.title}
      submitLabel={copy.confirm}
      cancelLabel={copy.cancel}
      submitVariant={kind === "resolve" ? "primary" : "secondary"}
      error={error}
      onSubmit={async () => {
        const trimmed = note.trim();
        if (kind === "resolve" && !trimmed) {
          setError(T.resolveDialog.noteRequired);
          return;
        }
        await onConfirm(trimmed);
      }}
    >
      <p className="text-sm text-text-main">{copy.body}</p>
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-text-sec">
          {copy.noteLabel}
        </label>
        <Textarea
          id={inputId}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            if (error) setError(null);
          }}
          placeholder={copy.notePlaceholder}
          rows={3}
          maxLength={NOTE_MAX}
        />
      </div>
    </FormDialog>
  );
}
