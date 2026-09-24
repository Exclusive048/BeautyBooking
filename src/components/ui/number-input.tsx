"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "inputMode"
> & {
  value: number;
  onValueChange: (next: number) => void;
  min: number;
  max: number;
  /** Значение, которое встаёт, если поле оставили пустым. */
  fallback: number;
};

/**
 * SCHEDULE-RULES-FREE-INPUT (2026-09-24) — целое число, которое можно стереть.
 *
 * Прежняя форма `value={n} onChange={(e) => set(Math.max(1, Number(v) || 1))}`
 * не давала удалить последний символ: пустая строка тут же превращалась в `1`
 * (или `0`), и «13» нельзя было исправить на «30». Здесь поле держит ЧЕРНОВИК
 * строкой, наружу отдаёт только число в границах, а при уходе с поля пустое
 * значение заменяет на `fallback`, вне границ — прижимает к ним.
 *
 * `type="text"` + `inputMode="numeric"`: на телефоне — цифровая клавиатура,
 * а черновик не превращается браузером в пустую строку на промежуточном вводе
 * (как у `type="number"` на «-» или «e»).
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  fallback,
  onBlur,
  ...rest
}: Props) {
  const [draft, setDraft] = useState(() => String(value));
  const [seenValue, setSeenValue] = useState(value);

  // Значение сменили снаружи (переключатель, сброс формы) — черновик догоняет.
  if (value !== seenValue) {
    setSeenValue(value);
    if (parseDraft(draft) !== value) setDraft(String(value));
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, String(max).length);
        setDraft(digits);
        const parsed = parseDraft(digits);
        if (parsed !== null && parsed >= min && parsed <= max && parsed !== value) {
          onValueChange(parsed);
        }
      }}
      onBlur={(event) => {
        const parsed = parseDraft(draft);
        const next = clamp(parsed ?? fallback, min, max);
        setDraft(String(next));
        if (next !== value) onValueChange(next);
        onBlur?.(event);
      }}
    />
  );
}

function parseDraft(draft: string): number | null {
  return draft === "" ? null : Number(draft);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
