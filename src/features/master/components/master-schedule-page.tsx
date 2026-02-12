"use client";

import { ScheduleBuilder } from "@/features/schedule/components/schedule-builder";

export function MasterSchedulePage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">График</h2>
        <p className="text-sm text-text-sec">Настройте шаблоны, недели и исключения.</p>
      </header>
      <ScheduleBuilder />
    </section>
  );
}
