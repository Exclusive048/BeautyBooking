"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { MasterPicker } from "./master-picker";
import { HoursTab } from "./hours-tab";
import { RulesTab } from "./rules-tab";
import { BreaksTab } from "./breaks-tab";
import { VisibilityTab } from "./visibility-tab";
import { ScheduleCalendarTab } from "@/features/master/components/schedule-settings/calendar/schedule-calendar-tab";
import { manualDayTemplateId } from "@/features/master/components/schedule-settings/calendar/lib/template-label";
import { SchedulePlanCard } from "@/features/master/components/schedule-settings/plan/schedule-plan-card";
import { schedulePatternEndpoint } from "@/features/master/components/schedule-settings/schedule-endpoint-context";

const T = UI_TEXT.studioCabinet.scheduleSettings;

// SCHEDULE-PATTERNS-01 (этап 3): «Особые дни» заменил календарь на 3 месяца.
type TabId = "calendar" | "hours" | "rules" | "breaks" | "visibility";
const DEFAULT_TAB: TabId = "calendar";
const VALID: ReadonlySet<TabId> = new Set([
  "calendar",
  "hours",
  "rules",
  "breaks",
  "visibility",
]);

type MasterOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type Props = {
  studioId: string;
  masters: MasterOption[];
  selectedMasterId: string | null;
  snapshot: ScheduleEditorSnapshot | null;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — client tabs shell + master
 * picker. URL state: `?master=<cuid>&tab=<tabId>`.
 *
 * **Tabs delegate to `/api/cabinet/master/schedule` with `?studioId&masterId`**
 * query params — the master endpoint already exposes a `STUDIO_ADMIN`
 * actor mode (see `resolveScheduleActor`). No new backend endpoint
 * for Phase A.
 *
 * Phase A: Hours + Rules tabs render real forms; Exceptions /
 * Breaks / Visibility render placeholders («Скоро в следующей фазе»).
 */
export function StudioScheduleSettingsBody({
  studioId,
  masters,
  selectedMasterId,
  snapshot,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  // Старые ссылки на «Особые дни» ведут в календарь — он их заменил.
  const requested = rawTab === "exceptions" ? "calendar" : rawTab;
  const active: TabId =
    requested && VALID.has(requested as TabId) ? (requested as TabId) : DEFAULT_TAB;

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const handleMasterChange = (nextMasterId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("master", nextMasterId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const TAB_ITEMS: TabItem[] = [
    { id: "calendar", label: T.tabs.calendar },
    // Порядок — как в кабинете мастера: одни и те же вкладки на своих местах.
    { id: "hours", label: T.tabs.hours },
    { id: "breaks", label: T.tabs.breaks },
    { id: "rules", label: T.tabs.rules },
    { id: "visibility", label: T.tabs.visibility },
  ];

  if (!selectedMasterId || !snapshot) {
    return (
      <div className="space-y-4">
        <MasterPicker
          masters={masters}
          selectedMasterId={selectedMasterId}
          onChange={handleMasterChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MasterPicker
        masters={masters}
        selectedMasterId={selectedMasterId}
        onChange={handleMasterChange}
      />

      <StudioMasterScheduleEditor
        key={selectedMasterId}
        studioId={studioId}
        masterId={selectedMasterId}
        initialSnapshot={snapshot}
        active={active}
        tabItems={TAB_ITEMS}
        onTabChange={handleTabChange}
      />
    </div>
  );
}

/**
 * SCHEDULE-PATTERNS-01 (этап 2): редактор расписания ОДНОГО мастера с его
 * графиком. Снапшот — локальное состояние: после применения графика из
 * пошагового окна вкладки пересоздаются (`revision`) со свежими данными.
 * Родитель задаёт `key` мастером, поэтому при смене мастера состояние
 * создаётся заново.
 */
function StudioMasterScheduleEditor({
  studioId,
  masterId,
  initialSnapshot,
  active,
  tabItems,
  onTabChange,
}: {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
  active: TabId;
  tabItems: TabItem[];
  onTabChange: (next: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [revision, setRevision] = useState(0);
  const [calendarBrush, setCalendarBrush] = useState<string | null>(null);
  const endpoint = `/api/cabinet/master/schedule?studioId=${encodeURIComponent(studioId)}&masterId=${encodeURIComponent(masterId)}`;

  return (
    <>
      <SchedulePlanCard
        snapshot={snapshot}
        patternEndpoint={schedulePatternEndpoint(endpoint)}
        previewEndpoint={schedulePatternEndpoint(endpoint, "/preview")}
        requestMode={false}
        onSnapshot={(next) => {
          setSnapshot(next);
          setRevision((value) => value + 1);
        }}
        onWizardApplied={(info, next) => {
          if (!info.manual) return;
          setCalendarBrush(manualDayTemplateId(next));
          onTabChange("calendar");
        }}
      />
      <div key={revision} className="space-y-5">
        <Tabs items={tabItems} value={active} onChange={onTabChange} />

        {active === "calendar" ? (
          <ScheduleCalendarTab
            endpoint={endpoint}
            snapshot={snapshot}
            onSnapshot={setSnapshot}
            initialBrushTemplateId={calendarBrush}
          />
        ) : active === "hours" ? (
          <HoursTab
            studioId={studioId}
            masterId={masterId}
            initialSnapshot={snapshot}
          />
        ) : active === "rules" ? (
          <RulesTab
            studioId={studioId}
            masterId={masterId}
            initialSnapshot={snapshot}
          />
        ) : active === "breaks" ? (
          <BreaksTab
            studioId={studioId}
            masterId={masterId}
            initialSnapshot={snapshot}
          />
        ) : (
          <VisibilityTab
            studioId={studioId}
            masterId={masterId}
            initialSnapshot={snapshot}
          />
        )}
      </div>
    </>
  );
}
