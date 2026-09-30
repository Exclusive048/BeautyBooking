"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithAuth, serverMessageOf } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";
import { InlineEditField, InlineEditPencil, InlineEditTextarea } from "@/components/ui/inline-edit";

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
 *
 * PWA-FIX-04 — режим просмотра печатает `savedValue`, а не проп `value`;
 * причина и контракт — в док-блоке `EditableFieldRow` (тот же дефект: после
 * blur строка возвращалась к серверному значению, и «О себе» выглядело
 * несохранённым до перезагрузки).
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  /** Что показывает режим просмотра (оптимистично). */
  const [savedValue, setSavedValue] = useState(value);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Последнее значение, которое подтвердил сервер, — точка отката при отказе. */
  const confirmedRef = useRef(value);

  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setSavedValue(value);
    if (!isEditing) setDraft(value);
  }

  useEffect(() => {
    confirmedRef.current = value;
  }, [value]);

  const autosave = useAutosave<string>(async (next) => {
    try {
      await fetchJsonWithAuth<unknown>(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: next }),
      });
    } catch (error) {
      setSavedValue(confirmedRef.current);
      return { ok: false, message: serverMessageOf(error) };
    }
    confirmedRef.current = next;
    setSavedValue(next);
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(savedValue);
    setDraft(savedValue);
    setIsEditing(true);
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const handleChange = (next: string) => {
    setDraft(next);
    autosave.scheduleSave(next);
  };

  /** См. `EditableFieldRow.commit` — optimistic + flush + refresh при правке. */
  const commit = () => {
    const changed = draft !== savedValue;
    setSavedValue(draft);
    setIsEditing(false);
    void autosave.flush(draft).then(() => {
      if (changed) startTransition(() => router.refresh());
    });
  };

  const handleBlur = () => {
    commit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || saveOnPlainEnter)) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(savedValue);
      autosave.cancel();
      setIsEditing(false);
    }
  };

  const isEmpty = !savedValue || savedValue.trim().length === 0;
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
            <InlineEditTextarea
              id={inputId}
              ref={textareaRef}
              value={draft}
              onChange={(event) => handleChange(event.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              maxLength={maxLength}
              placeholder={placeholder}
              rows={4}
              className="mt-1"
            />
            {counter ? (
              <p className="mt-1 font-mono text-[10px] text-text-sec">{counter}</p>
            ) : null}
          </>
        ) : (
          <InlineEditField multiline
            onClick={enterEdit}
            empty={isEmpty}
            className="mt-1"
          >
            {isEmpty ? T.emptyValue : savedValue}
          </InlineEditField>
        )}
        {autosave.errorMessage ? (
          <p role="alert" className="mt-1 text-xs text-danger-text">
            {autosave.errorMessage}
          </p>
        ) : null}
      </div>
      {!isEditing ? (
        <InlineEditPencil
          onClick={enterEdit}
          aria-label={T.editAriaLabel}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
