"use client";

import { MasterScheduleEditor } from "@/features/cabinet/master/schedule/master-schedule-editor";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinet.master.schedule;

export function MasterSchedulePage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{T.pageTitle}</h2>
        <p className="text-sm text-text-sec">{T.pageSubtitle}</p>
      </header>
      <MasterScheduleEditor />
    </section>
  );
}
