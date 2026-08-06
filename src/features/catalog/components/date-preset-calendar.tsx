"use client";

import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import "react-day-picker/style.css";

type Props = {
  selected: Date | undefined;
  /** Дни раньше этой даты недоступны для выбора. */
  minDate: Date;
  onSelect: (date: Date) => void;
};

/**
 * PERF-16 — календарь вынесен из `date-preset-chips.tsx` в отдельный модуль,
 * чтобы его можно было грузить через `next/dynamic`.
 *
 * Цена статического импорта была видна в бандле: `react-day-picker` +
 * `date-fns` + `@date-fns/tz` = чанк 80.7 kB parsed / 23.5 kB gzip, и он ехал
 * КАЖДОМУ посетителю `/catalog`, хотя календарь открывается по клику по чипу —
 * то есть у подавляющего большинства не открывается никогда. Разделение
 * работает только при отдельном модуле: `next/dynamic` — это граница чанка,
 * а не условие внутри компонента, поэтому вынести пришлось и импорт CSS
 * (`style.css` в родителе оставил бы половину веса на месте).
 *
 * Разметка и поведение перенесены дословно.
 */
export default function DatePresetCalendar({ selected, minDate, onSelect }: Props) {
  return (
    // react-day-picker v9 ships its own table-based layout in style.css. We keep
    // that structure intact and only theme it via the documented `--rdp-*` CSS
    // variables — overriding `classNames` here would replace the default table
    // classes and collapse the grid into a stack. The wrapping div scopes the
    // variables so they don't leak outside the popover.
    <div className="rdp-theme">
      <DayPicker
        mode="single"
        locale={ru}
        weekStartsOn={1}
        selected={selected}
        onSelect={(date) => {
          if (!date) return;
          onSelect(date);
        }}
        disabled={{ before: minDate }}
        showOutsideDays={false}
      />
    </div>
  );
}
