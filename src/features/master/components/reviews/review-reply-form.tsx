"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.reviews.reply;

type Props = {
  reviewId: string;
  /** When provided, the form opens in edit mode (PATCH) and pre-fills the
   *  textarea. Empty / undefined means create flow (POST). */
  initialText: string | null;
  onCancel: () => void;
  onSaved: () => void;
};

/**
 * Inline reply textarea with quick-reply chips. Two modes:
 *   - Create — POSTs to `/api/reviews/[id]/reply` (errors with 409 if a
 *     reply somehow lands between page load and submit; the PATCH route
 *     handles the edit case but this form always uses POST when no
 *     initial text is provided).
 *   - Edit — PATCHes the existing reply (added in 28a alongside this
 *     form so masters can fix typos / soften tone).
 *
 * Quick replies append with `\n\n` separator when the textarea isn't
 * empty, allowing the master to combine "Спасибо за отзыв! 🙏" with
 * "Будем рады видеть снова" without manually typing the break. Pure
 * UX convenience; backend doesn't care.
 */
export function ReviewReplyForm({ reviewId, initialText, onCancel, onSaved }: Props) {
  const isEdit = Boolean(initialText && initialText.trim().length > 0);
  const [text, setText] = useState(initialText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const appendQuick = (snippet: string) => {
    setText((prev) => (prev.trim().length > 0 ? `${prev}\n\n${snippet}` : snippet));
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : `API ${response.status}`;
        throw new Error(message);
      }
      onSaved();
      startTransition(() => router.refresh());
    } catch (err) {
      const message = err instanceof Error ? err.message : null;
      setError(message ?? (isEdit ? T.errorEdit : T.errorCreate));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy
    ? isEdit
      ? T.savingEdit
      : T.savingCreate
    : isEdit
      ? T.submitEdit
      : T.submitCreate;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-bg-input p-4">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={T.placeholder}
        rows={3}
        className="min-h-[88px] rounded-lg bg-bg-card text-sm"
        disabled={busy}
      />

      <div className="flex flex-wrap gap-1.5">
        {T.quickReplies.map((snippet) => (
          <button
            key={snippet}
            type="button"
            onClick={() => appendQuick(snippet)}
            disabled={busy}
            className="inline-flex items-center rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-xs text-text-main transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {snippet}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-lg"
          onClick={onCancel}
          disabled={busy}
        >
          {T.cancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="rounded-lg"
          onClick={handleSubmit}
          disabled={busy || text.trim().length === 0}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
