"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { BreaksTab } from "./breaks-tab";
import { HoursTab } from "./hours-tab";
import { RulesTab } from "./rules-tab";
import { VisibilityTab } from "./visibility-tab";
import { StudioApprovalBanner } from "./studio-approval-banner";
import { ScheduleCalendarTab } from "./calendar/schedule-calendar-tab";
import { manualDayTemplateId } from "./calendar/lib/template-label";
import { SchedulePlanCard } from "./plan/schedule-plan-card";
import {
  schedulePatternEndpoint,
  useIsStudioProfileSchedule,
  useScheduleEndpoint,
} from "./schedule-endpoint-context";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type TabId = "calendar" | "hours" | "breaks" | "rules" | "visibility";

/**
 * SCHEDULE-PATTERNS-01: «Особые дни» заменил календарь на 3 месяца (правка
 * любой даты — покраска дня). У профиля в студии он тот же, но покраска
 * копится в заявке студии (SCHEDULE-STUDIO-PROFILE-CALENDAR).
 */
const TABS: TabItem[] = [
  { id: "calendar", label: T.tabs.calendar },
  { id: "hours", label: T.tabs.hours },
  { id: "breaks", label: T.tabs.breaks },
  { id: "rules", label: T.tabs.rules },
  { id: "visibility", label: T.tabs.visibility },
];

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
  /** Forwarded to the Rules tab so it can render the locked Hot Slots state. */
  hotSlotsAllowed: boolean;
  /**
   * QA-114 (FIX-06): studio-approval context for a studio master. `null` for
   * independent masters (no banner shown).
   */
  studioApproval: { studioName: string; pending: boolean } | null;
};

/**
 * Client wrapper for the schedule-settings tabs. Reads `?tab=` from the
 * URL and writes back via `router.replace` (no scroll jump). All five
 * tabs (Calendar, Hours, Breaks, Rules, Visibility) render real content
 * after 25-SETTINGS-C.
 */
export function ScheduleSettingsBody({ initialSnapshot, hotSlotsAllowed, studioApproval }: Props) {
  const router = useRouter();
  // SCHEDULE-PATTERNS-01: график применяется из пошагового окна, и ответ несёт
  // новый снапшот. Вкладки держат черновики из `initialSnapshot`, поэтому после
  // применения они пересоздаются (`revision`) со свежими данными.
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [revision, setRevision] = useState(0);
  const [calendarBrush, setCalendarBrush] = useState<string | null>(null);
  const endpoint = useScheduleEndpoint();
  const studioProfile = useIsStudioProfileSchedule();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultTab: TabId = "calendar";
  const raw = searchParams.get("tab");
  // Старые ссылки на «Особые дни» ведут в календарь — он их заменил.
  const requested = raw === "exceptions" ? "calendar" : raw;
  const active: TabId = TABS.some((item) => item.id === requested) ? (requested as TabId) : defaultTab;

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultTab) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {studioApproval ? (
        <StudioApprovalBanner
          studioName={studioApproval.studioName}
          initialPending={studioApproval.pending}
        />
      ) : null}

      <SchedulePlanCard
        snapshot={snapshot}
        patternEndpoint={schedulePatternEndpoint(endpoint)}
        previewEndpoint={schedulePatternEndpoint(endpoint, "/preview")}
        requestMode={studioProfile}
        onSnapshot={(next) => {
          setSnapshot(next);
          setRevision((value) => value + 1);
        }}
        onWizardApplied={(info, next) => {
          // «Каждый раз по-разному»: дни отмечаются в календаре — открываем
          // его с кистью рабочего дня, созданного окном.
          if (!info.manual) return;
          setCalendarBrush(manualDayTemplateId(next));
          setTab("calendar");
        }}
      />

      <Tabs items={TABS} value={active} onChange={setTab} />

      <div key={revision}>
        {active === "calendar" ? (
          <ScheduleCalendarTab
            endpoint={endpoint}
            snapshot={snapshot}
            onSnapshot={setSnapshot}
            initialBrushTemplateId={calendarBrush}
            requestMode={studioProfile}
          />
        ) : active === "hours" ? (
          <HoursTab initialSnapshot={snapshot} onSnapshot={setSnapshot} />
        ) : active === "breaks" ? (
          <BreaksTab initialSnapshot={snapshot} />
        ) : active === "rules" ? (
          <RulesTab initialSnapshot={snapshot} hotSlotsAllowed={hotSlotsAllowed} />
        ) : (
          <VisibilityTab initialSnapshot={snapshot} />
        )}
      </div>
    </div>
  );
}
