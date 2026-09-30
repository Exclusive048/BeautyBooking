"use client";

import { cn } from "@/lib/cn";

type Props = {
  onDismiss: () => void;
  /** Что закрывает подложка — для экранного диктора («Закрыть меню»). */
  label: string;
  /** Слой и прочее позиционирование задаёт вызывающий (`z-*`). */
  className?: string;
};

/**
 * Невидимая подложка под открытым меню или поповером: клик мимо закрывает его
 * (29.09 доработки · 22, решение владельца 22.1 — даже такие места идут через
 * общий примитив). Кнопка, а не `div`: у клика мимо есть имя для диктора.
 * Кольца фокуса нет намеренно — подложка на весь экран, кольцо обвело бы экран.
 * С клавиатуры меню закрывает Escape у самого меню.
 */
export function DismissLayer({ onDismiss, label, className }: Props) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onDismiss}
      className={cn("fixed inset-0 cursor-default outline-none", className)}
    />
  );
}
