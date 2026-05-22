"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { MasterPicker } from "./master-picker";
import { HoursTab } from "./hours-tab";
import { RulesTab } from "./rules-tab";
import { ExceptionsTab } from "./exceptions-tab";
import { BreaksTab } from "./breaks-tab";
import { VisibilityTab } from "./visibility-tab";

const T = UI_TEXT.studioCabinet.scheduleSettings;

type TabId = "hours" | "rules" | "exceptions" | "breaks" | "visibility";
const VALID: ReadonlySet<TabId> = new Set([
  "hours",
  "rules",
  "exceptions",
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
 * actor mode (see `resolveTargetProvider`). No new backend endpoint
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
  const active: TabId =
    rawTab && VALID.has(rawTab as TabId) ? (rawTab as TabId) : "hours";

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "hours") {
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
    { id: "hours", label: T.tabs.hours },
    { id: "rules", label: T.tabs.rules },
    { id: "exceptions", label: T.tabs.exceptions },
    { id: "breaks", label: T.tabs.breaks },
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

      <Tabs items={TAB_ITEMS} value={active} onChange={handleTabChange} />

      {active === "hours" ? (
        <HoursTab
          studioId={studioId}
          masterId={selectedMasterId}
          initialSnapshot={snapshot}
        />
      ) : active === "rules" ? (
        <RulesTab
          studioId={studioId}
          masterId={selectedMasterId}
          initialSnapshot={snapshot}
        />
      ) : active === "exceptions" ? (
        <ExceptionsTab
          studioId={studioId}
          masterId={selectedMasterId}
          initialSnapshot={snapshot}
        />
      ) : active === "breaks" ? (
        <BreaksTab
          studioId={studioId}
          masterId={selectedMasterId}
          initialSnapshot={snapshot}
        />
      ) : (
        <VisibilityTab
          studioId={studioId}
          masterId={selectedMasterId}
          initialSnapshot={snapshot}
        />
      )}
    </div>
  );
}
