import React from "react";

import { cn } from "@/lib/cn";

/**
 * Выбор файла без системного вида (29.09 доработки · 22). Видимый нативный
 * `<input type="file">` в продукте не встречается: браузер рисует его своей
 * кнопкой и текстом «Файл не выбран» на языке системы.
 *
 * `mode`:
 * - `hidden` — поле скрыто целиком, его открывает кнопка-триггер (`ref.click()`);
 * - `label-target` — поле визуально скрыто, но фокусируемо: его обёртывает
 *   `<label>`-зона перетаскивания, и фокус с клавиатуры попадает в поле;
 * - `overlay` — прозрачное поле поверх зоны: клик по зоне и есть клик по полю.
 */
type Mode = "hidden" | "label-target" | "overlay";

const MODES: Record<Mode, string> = {
  hidden: "hidden",
  "label-target": "sr-only",
  overlay: "absolute inset-0 cursor-pointer opacity-0",
};

export function FileInput({
  mode = "hidden",
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { mode?: Mode }) {
  return <input type="file" className={cn(MODES[mode], className)} {...props} />;
}
