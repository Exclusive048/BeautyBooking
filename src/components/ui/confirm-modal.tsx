"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Notice } from "@/components/ui/notice";
import { ApiClientError, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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

/** Текст отказа `onConfirm` для плашки в окне. */
function refusalMessage(error: unknown): string {
  if (error instanceof ApiClientError) return serverMessageOr(error, UI_TEXT.common.errorGeneric);
  if (error instanceof Error && error.message) return error.message;
  return UI_TEXT.common.errorGeneric;
}

/**
 * Reusable confirm dialog backed by `ModalSurface`. Replaces native
 * `window.confirm()` across the app — see `useConfirm()` for the
 * imperative API. Supports an async `onConfirm` (await-friendly) and
 * a danger variant for destructive actions.
 *
 * UX-PASS-01: если `onConfirm` бросает, окно остаётся открытым и показывает
 * причину отказа — `message` брошенной ошибки (вызывающий кладёт туда
 * курируемую строку, см. `client-reviews-page.tsx`; у `ApiClientError` —
 * строка сервера по FIX-C8). Раньше `try/finally` без `catch` глотал отказ:
 * кнопка возвращалась в исходное состояние без единого слова, а промис
 * уходил необработанным.
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
  const [error, setError] = useState<string | null>(null);
  // Отказ прошлого открытия не переезжает в следующее.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setError(null);
  }

  const resolvedTitle = title ?? UI_TEXT.common.confirmDefaultTitle;
  const resolvedConfirm = confirmLabel ?? UI_TEXT.common.confirmDefaultLabel;
  const resolvedCancel = cancelLabel ?? UI_TEXT.common.cancel;

  async function handleConfirm() {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(refusalMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={onCancel} title={resolvedTitle}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-main">
        {message}
      </p>

      {error ? (
        <Notice tone="danger" className="mt-4">
          {error}
        </Notice>
      ) : null}

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
