"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatRussianPhoneInput,
  formatRussianPhoneInputOnChange,
  isCompleteRussianPhoneInput,
} from "@/lib/phone/input-format";
import { fetchJsonWithAuth, serverMessageOf } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";
import { InlineEditField, InlineEditInput, InlineEditPencil } from "@/components/ui/inline-edit";

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
 *
 * PWA-FIX-04 — режим просмотра печатает `savedValue`, а НЕ проп `value`.
 * Страница профиля — серверный компонент, и после PATCH проп остаётся тем,
 * каким его отрендерил сервер, пока дерево не обновится. Строка, печатавшая
 * проп, после blur возвращалась к старому значению — у пустой должности к
 * «Не заполнено», — и это читалось как «не сохранилось», хотя запрос прошёл
 * и перезагрузка показывала новое значение. Контракт скилла — optimistic UI:
 * `savedValue` ставится при коммите правки, при отказе сервера откатывается к
 * последнему подтверждённому значению (`confirmedRef`), а успешный коммит
 * обновляет серверное дерево (`router.refresh()`), чтобы карточка
 * заполненности профиля в сайдбаре пересчиталась. Образец — `SocialEditableRow`,
 * которая с самого начала держала `savedValue` и этим дефектом не страдала.
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputId = useId();
  const errorId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const toDisplay = (raw: string) => (formatValue ? formatValue(raw) : raw);
  /** Что показывает режим просмотра (оптимистично, см. док-блок выше). */
  const [savedValue, setSavedValue] = useState(value);
  const [draft, setDraft] = useState(() => toDisplay(value));
  /** Локальная ошибка валидации (незавершённый ввод) — блокирует сохранение. */
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Последнее значение, которое подтвердил сервер, — точка отката при отказе. */
  const confirmedRef = useRef(value);

  // Sync to props (React 19 — compare during render). The previous-prop
  // guard prevents wiping a user's in-progress edit when an unrelated
  // re-render brings the same value back.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setSavedValue(value);
    if (!isEditing) {
      setDraft(toDisplay(value));
    }
  }

  useEffect(() => {
    confirmedRef.current = value;
  }, [value]);

  const autosave = useAutosave<string>(async (next) => {
    const normalized = normalize ? normalize(next) : next;
    try {
      await fetchJsonWithAuth<unknown>(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: normalized }),
      });
    } catch (error) {
      // FIX-C8: действенный отказ («номер уже используется…») показывается
      // дословно — канонический «Попробуйте ещё раз» на 409 прямо неверен;
      // без серверной строки остаётся канон чипа. Откат оптимистичного значения.
      setSavedValue(confirmedRef.current);
      return { ok: false, message: serverMessageOf(error) };
    }
    confirmedRef.current = normalized;
    setSavedValue(normalized);
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(toDisplay(savedValue));
    setDraft(toDisplay(savedValue));
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

  /**
   * Коммит правки: значение показывается сразу (optimistic), уходит на сервер,
   * а по завершении обновляется серверное дерево. Без правки (Enter на
   * нетронутом поле) ни запроса, ни refresh — только выход из режима.
   */
  const commit = () => {
    const changed = draft !== toDisplay(savedValue);
    setSavedValue(draft);
    setIsEditing(false);
    void autosave.flush(draft).then(() => {
      if (changed) startTransition(() => router.refresh());
    });
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
      setDraft(toDisplay(savedValue));
      exitEdit();
      return;
    }
    commit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (validate && validate(draft) !== null) return;
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(toDisplay(savedValue));
      exitEdit();
    }
  };

  const isEmpty = !savedValue || savedValue.trim().length === 0;
  const feedback = invalidMessage ?? autosave.errorMessage;

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec"
          >
            {label}
          </label>
          <SaveStatusChip status={autosave.status} />
        </div>
        {isEditing ? (
          <>
            <InlineEditInput
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
              className="mt-1"
            />
            {maxLength && !formatOnChange ? (
              <p className="mt-1 font-mono text-3xs text-text-sec">
                {draft.length} / {maxLength}
              </p>
            ) : null}
          </>
        ) : (
          <InlineEditField
            onClick={enterEdit}
            empty={isEmpty}
            className="mt-1"
          >
            {isEmpty ? T.emptyValue : toDisplay(savedValue)}
          </InlineEditField>
        )}
        {feedback ? (
          <p id={errorId} className="mt-1 text-xs text-danger-text">
            {feedback}
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
