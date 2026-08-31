"use client";

import { Pencil } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatRussianPhoneInput,
  formatRussianPhoneInputOnChange,
  isCompleteRussianPhoneInput,
} from "@/lib/phone/input-format";
import { UI_TEXT } from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";

const T = UI_TEXT.cabinetMaster.profile.editable;

/**
 * PHONE-CLAIM-01 — масочные крючки выбираются по СЕРИАЛИЗУЕМОМУ пропу `mask`,
 * а не передаются функциями: `ContactsSection` — серверный компонент, и
 * функция-проп через RSC-границу не проезжает (§13: string id + lookup map).
 * `formatValue` идемпотентен (форматирует и ввод, и канон сервера);
 * `formatOnChange` — маска на каждый keystroke; пока `validate` возвращает
 * текст, сохранение НЕ уходит — иначе debounce отправлял бы каждый недобранный
 * номер и мигал ошибкой валидации.
 */
const MASKS = {
  phone: {
    formatValue: formatRussianPhoneInput,
    formatOnChange: formatRussianPhoneInputOnChange,
    validate: (draft: string): string | null =>
      draft === "" || isCompleteRussianPhoneInput(draft)
        ? null
        : UI_TEXT.cabinetMaster.profile.contacts.phoneIncomplete,
  },
} as const;

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
  /** Маска ввода — см. `MASKS` выше (RSC-safe id вместо функций-пропов). */
  mask?: keyof typeof MASKS;
};

/**
 * Inline-edit row with autosave. View mode shows label + value + faint
 * pencil; clicking anywhere on the row enters edit mode. Edit mode is
 * a transparent input with a single bottom border in `text-accent-text`
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
  mask,
}: Props) {
  const maskConfig = mask ? MASKS[mask] : null;
  const formatValue = maskConfig?.formatValue;
  const formatOnChange = maskConfig?.formatOnChange;
  const validate = maskConfig?.validate;
  const inputId = useId();
  const errorId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const toDisplay = (raw: string) => (formatValue ? formatValue(raw) : raw);
  const [draft, setDraft] = useState(() => toDisplay(value));
  /** Локальная ошибка валидации (незавершённый ввод) — блокирует сохранение. */
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync to props (React 19 — compare during render). The previous-prop
  // guard prevents wiping a user's in-progress edit when an unrelated
  // re-render brings the same value back.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!isEditing) {
      setDraft(toDisplay(value));
    }
  }

  const autosave = useAutosave<string>(async (next) => {
    const normalized = normalize ? normalize(next) : next;
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldKey]: normalized }),
    });
    if (!response.ok) {
      // FIX-C8: действенный отказ («номер уже используется…») показывается
      // дословно — канонический «Попробуйте ещё раз» на 409 прямо неверен.
      let message: string | undefined;
      try {
        const body: unknown = await response.json();
        const serverMessage = (body as { error?: { message?: unknown } } | null)?.error?.message;
        if (typeof serverMessage === "string" && serverMessage.trim().length > 0) {
          message = serverMessage;
        }
      } catch {
        // Тело не JSON — остаёмся на каноне чипа.
      }
      return { ok: false, message };
    }
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(toDisplay(value));
    setDraft(toDisplay(value));
    setInvalidMessage(null);
    setIsEditing(true);
    // Focus the input on the next tick — `useRef` isn't populated until
    // React paints the input.
    queueMicrotask(() => inputRef.current?.focus());
  };

  const exitEdit = () => {
    autosave.cancel();
    setInvalidMessage(null);
    setIsEditing(false);
  };

  const handleChange = (raw: string) => {
    const next = formatOnChange ? formatOnChange(draft, raw) : raw;
    setDraft(next);
    const invalid = validate ? validate(next) : null;
    setInvalidMessage(invalid);
    if (invalid) {
      // Не отправлять заведомо невалидное: отменяем и уже взведённый debounce.
      autosave.cancel();
      return;
    }
    autosave.scheduleSave(next);
  };

  const handleBlur = () => {
    if (validate && validate(draft) !== null) {
      // Невалидный черновик на blur не сохраняется и не остаётся висеть —
      // строка возвращается к последнему сохранённому значению.
      setDraft(toDisplay(value));
      exitEdit();
      return;
    }
    void autosave.flush(draft);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (validate && validate(draft) !== null) return;
      void autosave.flush(draft);
      setIsEditing(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(toDisplay(value));
      exitEdit();
    }
  };

  const isEmpty = !value || value.trim().length === 0;
  const feedback = invalidMessage ?? autosave.errorMessage;

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
              aria-invalid={invalidMessage ? true : undefined}
              aria-describedby={feedback ? errorId : undefined}
              className="mt-1 block w-full border-0 border-b-2 border-primary bg-transparent py-1 text-sm text-text-main outline-none focus:ring-0"
            />
            {maxLength && !formatOnChange ? (
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
            {isEmpty ? T.emptyValue : toDisplay(value)}
          </button>
        )}
        {feedback ? (
          <p id={errorId} className="mt-1 text-xs text-danger-text">
            {feedback}
          </p>
        ) : null}
      </div>
      {!isEditing ? (
        <button
          type="button"
          onClick={enterEdit}
          aria-label={T.editAriaLabel}
          className="mt-2 shrink-0 rounded-md p-1.5 text-text-sec opacity-0 transition-opacity hover:text-accent-text group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
