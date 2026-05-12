"use client";

import { Pencil } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";

const T = UI_TEXT.cabinetMaster.profile.editable;

type Props = {
  label: string;
  value: string;
  /** Field name used in the PATCH body. */
  fieldKey: string;
  /** API path. Defaults to `/api/master/profile`. */
  apiPath?: string;
  placeholder?: string;
  /** Optional max length — also drives a counter under the input. */
  maxLength?: number;
  /** Optional value normaliser run before save. */
  normalize?: (value: string) => string;
};

/**
 * Inline-edit row with autosave. View mode shows label + value + faint
 * pencil; clicking anywhere on the row enters edit mode. Edit mode is
 * a transparent input with a single bottom border in `text-primary`
 * — per the ui-ux-pro-max skill's main pattern (no full input frame).
 *
 * Save lifecycle:
 *   - typing → debounced save (700 мс)
 *   - blur → save now
 *   - Enter → save now
 *   - Escape → revert to last-saved value, leave edit mode
 */
export function EditableFieldRow({
  label,
  value,
  fieldKey,
  apiPath = "/api/master/profile",
  placeholder,
  maxLength,
  normalize,
}: Props) {
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync to props (React 19 — compare during render). The previous-prop
  // guard prevents wiping a user's in-progress edit when an unrelated
  // re-render brings the same value back.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!isEditing) {
      setDraft(value);
    }
  }

  const autosave = useAutosave<string>(async (next) => {
    const normalized = normalize ? normalize(next) : next;
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldKey]: normalized }),
    });
    if (!response.ok) return { ok: false };
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(value);
    setDraft(value);
    setIsEditing(true);
    // Focus the input on the next tick — `useRef` isn't populated until
    // React paints the input.
    queueMicrotask(() => inputRef.current?.focus());
  };

  const exitEdit = () => {
    autosave.cancel();
    setIsEditing(false);
  };

  const handleChange = (next: string) => {
    setDraft(next);
    autosave.scheduleSave(next);
  };

  const handleBlur = () => {
    void autosave.flush(draft);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void autosave.flush(draft);
      setIsEditing(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      exitEdit();
    }
  };

  const isEmpty = !value || value.trim().length === 0;

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
          >
            {label}
          </label>
          <SaveStatusChip status={autosave.status} />
        </div>
        {isEditing ? (
          <>
            <input
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(event) => handleChange(event.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              maxLength={maxLength}
              placeholder={placeholder}
              className="mt-1 block w-full border-0 border-b-2 border-primary bg-transparent py-1 text-sm text-text-main outline-none focus:ring-0"
            />
            {maxLength ? (
              <p className="mt-1 font-mono text-[10px] text-text-sec">
                {draft.length} / {maxLength}
              </p>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={enterEdit}
            className={cn(
              "mt-1 block w-full text-left text-sm",
              isEmpty ? "italic text-text-sec" : "text-text-main"
            )}
          >
            {isEmpty ? T.emptyValue : value}
          </button>
        )}
      </div>
      {!isEditing ? (
        <button
          type="button"
          onClick={enterEdit}
          aria-label={T.editAriaLabel}
          className="mt-2 shrink-0 rounded-md p-1.5 text-text-sec opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
