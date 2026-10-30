"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminUserRow } from "@/features/admin-cabinet/users/types";

const T = UI_TEXT.adminPanel.users.block.dialog;
const TOASTS = UI_TEXT.adminPanel.users.toasts;

/** Совпадает с `BLOCK_REASON_MAX_LENGTH` сервера (`block.service.ts`). */
const REASON_MAX_LENGTH = 500;

type Props = {
  user: AdminUserRow;
  onClose: () => void;
  /** Бросает при отказе сервера — окно остаётся открытым и показывает причину. */
  onSubmit: (reason: string) => Promise<void>;
};

/**
 * USER-BLOCKING-01 — окно блокировки: причина обязательна (уходит в профиль
 * и в журнал действий администраторов). Отказ сервера показывается в окне,
 * а не тостом: внутри окна фокус заперт, и действовать нужно здесь же
 * (скилл дизайна, «Тост или сообщение в форме»). Родитель монтирует окно
 * заново на каждое открытие (`key`), поэтому начальное состояние всегда пустое.
 */
export function BlockUserDialog({ user, onClose, onSubmit }: Props) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(T.reasonRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (submitError) {
      setError(serverMessageOr(submitError, TOASTS.blockFailed));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open onClose={submitting ? () => undefined : onClose} title={T.title}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
          <p className="text-xs text-text-sec">{T.userLabel}</p>
          <p className="mt-0.5 text-sm font-medium text-text-main">{user.displayName}</p>
        </div>

        <Notice tone="warning">{T.consequences}</Notice>

        <div>
          <FieldLabel htmlFor={reasonId} tone="muted">
            {T.reasonLabel}
          </FieldLabel>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            placeholder={T.reasonPlaceholder}
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            required
            aria-invalid={error ? true : undefined}
          />
          <p className="mt-1 text-xs text-text-sec/70">{T.reasonHint}</p>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={submitting || !reason.trim()}
          >
            {T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
