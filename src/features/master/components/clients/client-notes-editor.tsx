"use client";

import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.detail.notes;

/**
 * MASTER-CLIENTS-FIX-A #6 — notes editor for the master CRM card.
 *
 * Replaces the previous read-only `<ClientNotesDisplay>` whose «Скоро»
 * placeholder hinted that editing was deferred. The backend write path
 * (`PATCH /api/master/clients/[clientKey]/card`) already exists and
 * enforces master-only auth + provider-scoped ownership — this is pure
 * UI work to surface the existing capability.
 *
 * Privacy invariant #25 is preserved: the notes payload remains a
 * master-private field (`ClientCard.notes`). The detail view that
 * embeds this editor is loaded via `/api/master/clients/[key]/detail`,
 * which is itself master-scoped. No client-cabinet surface receives
 * the notes value — that boundary is guarded by
 * `client-privacy.test.ts` (13 regression tests, unchanged).
 *
 * UX:
 *   - read mode: existing notes preview + «Редактировать» CTA
 *   - edit mode: textarea (max 2000) + Save/Cancel + loading
 *   - Save → optimistic state update + server PATCH (rollback on
 *     failure)
 *   - Cancel → revert to last-saved value, exit edit mode
 *   - Escape key (textarea-focused) closes without saving
 */
const MAX_NOTES_LENGTH = 2000;

type Props = {
  /** Opaque client key (`user:<cuid>` / `phone:<phone>`). The route
   *  decodes it on the server; the client only needs to pass it
   *  through opaquely. */
  clientKey: string;
  initialNotes: string | null;
};

export function ClientNotesEditor({ clientKey, initialNotes }: Props) {
  const [saved, setSaved] = useState<string>(initialNotes ?? "");
  const [draft, setDraft] = useState<string>(initialNotes ?? "");
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the detail panel switches to a different client, the parent
  // remounts the section via React's reconciler (no key change here but
  // `initialNotes` changes). Keep the local state synced.
  useEffect(() => {
    setSaved(initialNotes ?? "");
    setDraft(initialNotes ?? "");
    setMode("read");
    setError(null);
  }, [initialNotes, clientKey]);

  function startEdit() {
    setDraft(saved);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setDraft(saved);
    setError(null);
    setMode("read");
  }

  async function commit() {
    const trimmed = draft.trim();
    // Treat empty-or-whitespace draft as "clear notes" (matches the
    // server schema: `notes: null` when nothing meaningful was typed).
    const nextValue = trimmed.length > 0 ? trimmed : "";
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/clients/${encodeURIComponent(clientKey)}/card`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Server schema treats null/empty/whitespace as "clear".
          body: JSON.stringify({ notes: trimmed.length > 0 ? trimmed : null }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ card: { notes: string | null } }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
      }
      const serverValue = json.data.card.notes ?? "";
      setSaved(serverValue);
      setDraft(serverValue);
      setMode("read");
    } catch (err) {
      setError(err instanceof Error ? err.message : T.saveError);
      // Revert draft preview to the last-saved value so the user can
      // retry from a clean baseline without losing what they typed.
      setDraft(nextValue);
    } finally {
      setSaving(false);
    }
  }

  const isDirty = draft.trim() !== saved.trim();
  const isOverLimit = draft.length > MAX_NOTES_LENGTH;

  return (
    <section className="border-b border-border-subtle py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.heading}
        </p>
        {mode === "read" ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 text-xs text-text-sec transition-colors hover:text-text-main"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {T.editLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs text-text-sec transition-colors hover:text-text-main disabled:opacity-60"
            aria-label={T.cancelLabel}
          >
            <X className="h-3 w-3" aria-hidden />
            {T.cancelLabel}
          </button>
        )}
      </div>

      {mode === "read" ? (
        saved.trim().length > 0 ? (
          <p className="whitespace-pre-wrap rounded-xl bg-bg-input p-3 text-sm text-text-main">
            {saved}
          </p>
        ) : (
          <p className="text-sm italic text-text-sec">{T.empty}</p>
        )
      ) : (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !saving) {
                event.preventDefault();
                cancelEdit();
              }
            }}
            placeholder={T.editPlaceholder}
            disabled={saving}
            rows={5}
            maxLength={MAX_NOTES_LENGTH + 200}
            autoFocus
            aria-label={T.editLabel}
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={
                isOverLimit
                  ? "text-xs text-rose-600 dark:text-rose-300"
                  : "text-xs text-text-sec/70"
              }
            >
              {draft.length} / {MAX_NOTES_LENGTH}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-lg"
              >
                {T.cancelLabel}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void commit()}
                disabled={saving || !isDirty || isOverLimit}
                className="rounded-lg"
              >
                {saving ? T.saving : T.saveLabel}
              </Button>
            </div>
          </div>
          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
