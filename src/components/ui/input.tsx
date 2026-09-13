import { cn } from "@/lib/cn";
import { defaultUnlessOverridden } from "@/lib/ui/class-groups";
import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * CN-CONFLICT-CLASS (PWA-FIX-12) — ширина уступает вызывающему.
 *
 * 🔴 Замер на боевом бандле: `.w-[6.5rem]` печатается строкой 2571, `.w-full` —
 * 2608, то есть дефолт примитива побеждал. `cn` — плоский join, поэтому порядок
 * классов в атрибуте не значит ничего. Следствие было живым и видимым: у полей
 * времени в редакторе часов (`TimeField`, `schedule-settings/weekday-row.tsx`,
 * 4 сайта) заданная ширина `w-[6.5rem]` / `w-[5.5rem]` НЕ применялась, каждое
 * поле растягивалось на всю строку, и строка дня вместо одной линии занимала
 * пять. На телефоне это и делало редактор часов нечитаемым.
 *
 * `w-full` остаётся дефолтом: подавляющее большинство полей в формах должны
 * занимать всю ширину. Меняется только то, что заданная вызывающим ширина
 * теперь ПРИМЕНЯЕТСЯ. Радиус остаётся жёстким — это форма поля, и он в реестре
 * `class-groups.test.ts` с обоснованием (0 коллизий).
 */
export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "lux-input h-11 rounded-2xl px-4 text-sm text-text-main placeholder:text-text-placeholder outline-none",
        defaultUnlessOverridden(className, "width", "w-full"),
        className
      )}
      {...props}
    />
  );
}
