"use client";

import { MasterScheduleEditor } from "@/features/cabinet/master/schedule/master-schedule-editor";
import { ScheduleBuilder } from "@/features/schedule/components/schedule-builder";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinet.master.schedule;

type MasterSchedulePageProps = {
  isStudioManaged: boolean;
};

export function MasterSchedulePage({ isStudioManaged }: MasterSchedulePageProps) {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{T.pageTitle}</h2>
        <p className="text-sm text-text-sec">{T.pageSubtitle}</p>
      </header>
      {isStudioManaged ? <ScheduleBuilder /> : <MasterScheduleEditor />}
    </section>
  );
}
