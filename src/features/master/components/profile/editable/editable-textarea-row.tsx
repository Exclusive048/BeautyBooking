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
  fieldKey: string;
  apiPath?: string;
  placeholder?: string;
  maxLength?: number;
  /** Override the default Cmd/Ctrl+Enter "save and exit" behaviour. */
  saveOnPlainEnter?: boolean;
  counterTemplate?: string;
};

/**
 * Multi-line variant. Same autosave lifecycle as `EditableFieldRow`, but
 * Enter inserts a newline (Cmd/Ctrl+Enter saves and exits). Skill rule:
 * "Cmd/Ctrl+Enter → save (для textarea)".
 */
export function EditableTextareaRow({
  label,
  value,
  fieldKey,
  apiPath = "/api/master/profile",
  placeholder,
  maxLength,
  saveOnPlainEnter = false,
  counterTemplate,
}: Props) {
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!isEditing) setDraft(value);
  }

  const autosave = useAutosave<string>(async (next) => {
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldKey]: next }),
    });
    if (!response.ok) return { ok: false };
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(value);
    setDraft(value);
    setIsEditing(true);
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const handleChange = (next: string) => {
    setDraft(next);
    autosave.scheduleSave(next);
  };

  const handleBlur = () => {
    void autosave.flush(draft);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || saveOnPlainEnter)) {
      event.preventDefault();
      void autosave.flush(draft);
      setIsEditing(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      autosave.cancel();
      setIsEditing(false);
    }
  };

  const isEmpty = !value || value.trim().length === 0;
  const counter = counterTemplate
    ? counterTemplate.replace("{value}", String(draft.length)).replace("{max}", String(maxLength ?? ""))
    : maxLength
      ? `${draft.length} / ${maxLength}`
      : null;

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
            <textarea
              id={inputId}
              ref={textareaRef}
              value={draft}
              onChange={(event) => handleChange(event.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              maxLength={maxLength}
              placeholder={placeholder}
              rows={4}
              className="mt-1 block w-full resize-y border-0 border-b-2 border-primary bg-transparent py-1 text-sm leading-relaxed text-text-main outline-none focus:ring-0"
            />
            {counter ? (
              <p className="mt-1 font-mono text-[10px] text-text-sec">{counter}</p>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={enterEdit}
            className={cn(
              "mt-1 block w-full whitespace-pre-wrap text-left text-sm leading-relaxed",
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
