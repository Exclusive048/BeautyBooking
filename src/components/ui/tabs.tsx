"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  badge?: string | number;
  /** When true the button is rendered but ignores clicks. Visualised as muted + cursor-not-allowed. */
  disabled?: boolean;
  /** Optional native title attribute — shown as tooltip on hover, useful for "Скоро" hints on disabled tabs. */
  title?: string;
};

/**
 * PWA-FIX-12 — полоса вкладок НЕ переносится, а прокручивается по горизонтали.
 *
 * 🔴 `flex-wrap` на телефоне превращал набор из четырёх-пяти вкладок в два-три
 * ряда: на 375px «Часы · Исключения · Перерывы · Правила · Видимость» занимали
 * три ряда пилюль, то есть ~120px вертикали под один переключатель, а ряды
 * получались разной длины и читались как несколько групп, а не как одна шкала.
 *
 * ⚠️ `overflow-x-auto` и `min-w-max` на ОДНОМ элементе — запрещённая форма
 * (FIX-D2, сторож `lib/ui/horizontal-strip.test.ts`): `min-width` сильнее
 * `max-width`, содержимое из элемента не выпадает, прокрутка мертва, а лишняя
 * ширина уезжает в документ. Здесь её нет: контейнер прокручивает вкладки за
 * счёт того, что сами вкладки `shrink-0`, а контейнер при `inline-flex`
 * сжимается до доступной ширины. Проверять надо поведением — `innerWidth ===
 * documentElement.clientWidth` (`.qa/no-horizontal-overflow.spec.ts`), а не
 * чтением классов.
 */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border-subtle bg-bg-input p-1.5 shadow-card scrollbar-hide",
        className
      )}
    >
      {items.map((t) => {
        const active = value === t.id;
        const disabled = t.disabled === true;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (disabled) return;
              onChange(t.id);
            }}
            aria-disabled={disabled}
            title={t.title}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all duration-300",
              disabled
                ? "cursor-not-allowed text-text-sec/40"
                : active
                ? "bg-bg-card text-text-main shadow-[0_8px_18px_rgb(20_20_20/0.12)]"
                : "text-text-sec hover:bg-bg-card/80 hover:text-text-main"
            )}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-xl px-2 py-0.5 text-xs",
                  active
                    ? "bg-primary/15 text-text-main"
                    : "bg-bg-page text-text-sec"
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
