"use client";

import type { ReactNode } from "react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.week;

type Props = {
  children: ReactNode;
};

/**
 * Single-card container for the seven weekday rows. Section header on
 * top, then a list with subtle dividers between rows — replaces the
 * old "card-per-day" stack which created a heavy visual rhythm on
 * desktop.
 *
 * The children must be the 7 `<WeekdayRow>`s. The list relies on
 * `divide-y` between siblings, so any extra wrapper here would break
 * the dividers — keep the body a single flat list.
 */
export function WeeklyDaysList({ children }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <header className="border-b border-border-subtle px-4 py-3">
        <h2 className="font-display text-base text-text-main">{T.sectionTitle}</h2>
        <p className="mt-0.5 text-xs text-text-sec">{T.hint}</p>
      </header>
      <ul className="divide-y divide-border-subtle">{children}</ul>
    </section>
  );
}
