"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

export type ConfirmVariant = "default" | "danger";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type Props = ConfirmOptions & {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Reusable confirm dialog backed by `ModalSurface`. Replaces native
 * `window.confirm()` across the app — see `useConfirm()` for the
 * imperative API. Supports an async `onConfirm` (await-friendly) and
 * a danger variant for destructive actions.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  const [isPending, setIsPending] = useState(false);

  const resolvedTitle = title ?? UI_TEXT.common.confirmDefaultTitle;
  const resolvedConfirm = confirmLabel ?? UI_TEXT.common.confirmDefaultLabel;
  const resolvedCancel = cancelLabel ?? UI_TEXT.common.cancel;

  async function handleConfirm() {
    if (isPending) return;
    setIsPending(true);
    try {
      await onConfirm();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={onCancel} title={resolvedTitle}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-main">
        {message}
      </p>

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
          disabled={isPending}
        >
          {isPending ? UI_TEXT.common.confirmPending : resolvedConfirm}
        </Button>
      </div>
    </ModalSurface>
  );
}
