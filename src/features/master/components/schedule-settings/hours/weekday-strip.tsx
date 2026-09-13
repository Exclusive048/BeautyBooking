"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { DayScheduleDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.week;

const DAY_LABELS: Record<number, string> = {
  0: T.days.mon,
  1: T.days.tue,
  2: T.days.wed,
  3: T.days.thu,
  4: T.days.fri,
  5: T.days.sat,
  6: T.days.sun,
};

type Props = {
  days: DayScheduleDto[];
  activeDayOfWeek: number;
  onSelect: (dayOfWeek: number) => void;
};

/**
 * PWA-FIX-12 — горизонтальный выбор дня недели для настройки часов на телефоне.
 *
 * 🔴 Зачем. Редактор часов — семь строк `<WeekdayRow>`, и каждая строка это
 * `flex flex-wrap`: переключатель, бейдж дня, начало—конец, чистые часы, теги
 * перерывов, «+ Перерыв» и меню действий. На 375px строка переносится в две-три
 * линии, то есть неделя занимала ~600px вертикали, и чтобы дойти до субботы,
 * приходилось прокручивать мимо всего остального. При этом РЕДАКТИРУЕТСЯ за раз
 * всегда один день — вертикаль уходила на строки, к которым не обращаются.
 *
 * Полоса отвечает на «какой день», редактор под ней — на «что в нём». Дни всегда
 * видны целиком: семь коротких подписей помещаются в ширину экрана, поэтому
 * прокрутка полосы — страховка для крупного системного шрифта, а не рабочий
 * путь. Точка под подписью говорит, рабочий день или нет, — иначе выбор дня
 * пришлось бы делать наугад.
 *
 * На `lg` и шире полоса не рендерится: там все семь строк видны сразу и
 * одновременное сравнение дней полезнее экономии высоты.
 */
export function WeekdayStrip({ days, activeDayOfWeek, onSelect }: Props) {
  return (
    <div
      className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide"
      role="tablist"
      aria-label={T.sectionTitle}
    >
      {days.map((day) => {
        const isActive = day.dayOfWeek === activeDayOfWeek;
        return (
          <Button
            key={day.dayOfWeek}
            variant="wrapper"
            size="none"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(day.dayOfWeek)}
            className={cn(
              "flex min-w-0 flex-1 shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors",
              isActive
                ? "bg-primary/10 text-accent-text"
                : "text-text-sec hover:bg-bg-input",
            )}
          >
            <span className="font-mono text-xs font-semibold uppercase tracking-wider">
              {DAY_LABELS[day.dayOfWeek]}
            </span>
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                day.isWorkday ? "bg-primary" : "bg-border-subtle",
              )}
            />
            <span className="sr-only">{day.isWorkday ? T.onLabel : T.offLabel}</span>
          </Button>
        );
      })}
    </div>
  );
}
