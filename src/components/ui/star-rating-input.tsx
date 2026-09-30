"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PRESS } from "@/components/ui/motion-classes";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** `md` — 28px (модалки кабинета), `lg` — 32px (публичная форма отзыва). */
  size?: "md" | "lg";
  className?: string;
};

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Выбор оценки 1–5 (29.09 доработки · 22) — одна реализация вместо трёх копий
 * (модалка отзыва и правки отзыва в кабинете клиента, публичная форма отзыва).
 *
 * Звёзды бордовые (`fill-primary`), как в референсе `clientReviews.js`;
 * наведение подсвечивает будущую оценку. Звёзды ОТОБРАЖЕНИЯ рейтинга в каталоге
 * — другой элемент и другой токен (`rating`).
 */
export function StarRatingInput({ value, onChange, disabled = false, size = "md", className }: Props) {
  const [hovered, setHovered] = useState(0);
  const effective = hovered || value;
  return (
    <div className={cn("flex items-center gap-0.5", className)} onMouseLeave={() => setHovered(0)}>
      {STARS.map((star) => (
        <Button
          key={star}
          variant="wrapper"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          disabled={disabled}
          aria-pressed={star === value}
          aria-label={UI_TEXT.reviews.form.starAria.replace("{star}", String(star))}
          className={cn("rounded-lg p-1", PRESS)}
        >
          <Star
            className={cn(
              "transition-colors",
              size === "lg" ? "h-8 w-8" : "h-7 w-7",
              star <= effective ? "fill-primary text-accent-text" : "text-text-sec/40",
            )}
            aria-hidden
          />
        </Button>
      ))}
    </div>
  );
}
