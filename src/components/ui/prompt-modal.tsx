"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import * as UI_TEXT from "@/lib/ui/text";

export type PromptVariant = "default" | "danger";

export type PromptOptions = {
  title?: string;
  /** Block of prose shown above the textarea. Optional. */
  message?: string;
  /** Above-textarea label. Optional — falls back to «Комментарий». */
  label?: string;
  placeholder?: string;
  /** When true, blank text (after trim) is rejected and the submit
   *  button stays disabled. Defaults to true. */
  required?: boolean;
  /** Max character cap for the textarea. Defaults to 500. */
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: PromptVariant;
};

type Props = PromptOptions & {
  open: boolean;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * MASTER-BOOKING-UI-FIX-A — reusable text-prompt dialog backed by
 * `ModalSurface`. Replaces native `window.prompt()` for surfaces that
 * need a free-text reason as part of a confirmation (decline / cancel
 * with comment). Pairs with `usePrompt()` for the imperative API:
 *
 *   const { prompt, modal } = usePrompt();
 *   const reason = await prompt({
 *     title: "Отменить запись",
 *     message: "Сообщите клиенту причину…",
 *     label: "Причина отмены",
 *     placeholder: "Например: «Заболела»",
 *     confirmLabel: "Отменить запись",
 *     variant: "danger",
 *   });
 *   if (reason) doCancel(reason);
 *   return <>{...}{modal}</>;
 *
 * Sibling primitive to `ConfirmModal` / `useConfirm` (yes-no only). The
 * onConfirm callback receives the trimmed value so callers don't need
 * to defensively re-trim.
 */
export function PromptModal({
  open,
  title,
  message,
  label,
  placeholder,
  required = true,
  maxLength = 500,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  const [isPending, setIsPending] = useState(false);

  // Reset state whenever the modal opens — without this, a previously
  // submitted reason would be pre-filled when the dialog re-opens for
  // a different booking.
  useEffect(() => {
    if (open) {
      setValue("");
      setIsPending(false);
    }
  }, [open]);

  const trimmed = value.trim();
  const isValid = required ? trimmed.length > 0 : true;

  const resolvedTitle = title ?? UI_TEXT.common.confirmDefaultTitle;
  const resolvedConfirm = confirmLabel ?? UI_TEXT.common.confirmDefaultLabel;
  const resolvedCancel = cancelLabel ?? UI_TEXT.common.cancel;
  const resolvedLabel = label ?? UI_TEXT.common.commentLabel;

  async function handleConfirm() {
    if (isPending || !isValid) return;
    setIsPending(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={onCancel} title={resolvedTitle}>
      {message ? (
        <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-text-main">
          {message}
        </p>
      ) : null}

      <label className="mb-1 block eyebrow text-2xs">
        {resolvedLabel}
      </label>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        autoFocus
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          {resolvedCancel}
        </Button>
        <Button
          type="button"
          variant={variant === "danger" ? "danger" : "primary"}
          size="sm"
          onClick={() => void handleConfirm()}
          disabled={isPending || !isValid}
        >
          {isPending ? UI_TEXT.common.confirmPending : resolvedConfirm}
        </Button>
      </div>
    </ModalSurface>
  );
}
