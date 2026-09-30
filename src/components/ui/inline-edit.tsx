"use client";

import { Pencil } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Примитивы inline-редактирования (дизайн-скилл §7, 29.09 доработки · 22):
 * поле с подчёркиванием вместо рамки, режим чтения и карандаш «править».
 * Логика автосохранения остаётся у строк (`features/master/.../editable/*`) —
 * здесь только вид, одинаковый у всех строк.
 *
 * Подчёркивание (`underline`):
 * - `always` — сплошной primary. Для полей, которые размонтируются вместе с
 *   потерей фокуса (`onBlur` → выход из правки): расфокусированными они не
 *   бывают, и подчёркивание само является индикатором фокуса;
 * - `focus` — приглушённое, primary только в фокусе (UI-32). Для полей, которые
 *   НЕ уходят из правки по blur (адрес с подсказками): сплошной primary выглядел
 *   бы одинаково с фокусом и без;
 * - `none` — без своей черты: подчёркивание рисует обёртка (`focus-within:`),
 *   как у адреса страницы с префиксом «@», или поле живёт внутри чужой рамки
 *   (ввод тега среди чипов).
 *
 * `focus:ring-0` гасит кольцо базового правила `input:focus` — индикатором
 * служит подчёркивание (реестр `focus-indicator.test.ts`).
 */
type Underline = "always" | "focus" | "none";

const FIELD_BASE = "block w-full border-0 bg-transparent py-1 text-sm text-text-main outline-none focus:ring-0";
const UNDERLINE: Record<Underline, string> = {
  always: "border-b-2 border-primary",
  focus: "border-b-2 border-border-subtle focus:border-primary",
  none: "",
};

export function InlineEditInput({
  underline = "always",
  className,
  ...props
}: React.ComponentProps<"input"> & { underline?: Underline }) {
  return <input className={cn(FIELD_BASE, UNDERLINE[underline], className)} {...props} />;
}

export function InlineEditTextarea({
  underline = "always",
  className,
  ...props
}: React.ComponentProps<"textarea"> & { underline?: Underline }) {
  return (
    <textarea
      className={cn(FIELD_BASE, "resize-y leading-relaxed", UNDERLINE[underline], className)}
      {...props}
    />
  );
}

/**
 * Режим чтения: значение во всю ширину строки, клик — войти в правку. Пустое
 * значение — курсивом и приглушённо.
 */
export function InlineEditField({
  empty = false,
  multiline = false,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { empty?: boolean; multiline?: boolean }) {
  return (
    <Button
      variant="wrapper"
      className={cn(
        "block w-full rounded-md text-left text-sm",
        multiline && "whitespace-pre-wrap leading-relaxed",
        empty ? "italic text-text-sec" : "text-text-main",
        className,
      )}
      {...props}
    />
  );
}

/** Бледный карандаш справа от строки: виден при наведении на строку и в фокусе. */
export function InlineEditPencil({ className, ...props }: React.ComponentProps<typeof Button> & { "aria-label": string }) {
  return (
    <Button
      variant="wrapper"
      className={cn(
        "shrink-0 rounded-md p-1.5 text-text-sec opacity-0 transition-opacity hover:text-accent-text group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      {...props}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}
