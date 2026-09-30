"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Props = {
  /** Имя для экранного чтеца — значок сам по себе ничего не называет. */
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Для кнопки, открывающей меню. */
  expanded?: boolean;
  className?: string;
  "data-testid"?: string;
};

/**
 * Кнопка-значок поверх фото (плитка портфолио и т.п.): зона нажатия 40px,
 * видимый кружок 32px на затемнённом стекле — читается и на светлом, и на
 * тёмном снимке. Видна всегда: на телефоне наведения нет, а «появится при
 * наведении» на ПК прячет действие от того, кто не догадался навести.
 */
export function PhotoActionButton({
  label,
  onClick,
  children,
  disabled,
  expanded,
  className,
  "data-testid": testId,
}: Props) {
  return (
    <Button
      type="button"
      variant="wrapper"
      size="none"
      aria-label={label}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "group/photo-action grid h-10 w-10 place-items-center rounded-full",
        className,
      )}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white shadow-card ring-1 ring-white/40 backdrop-blur-sm transition-colors group-hover/photo-action:bg-black/65">
        {children}
      </span>
    </Button>
  );
}
