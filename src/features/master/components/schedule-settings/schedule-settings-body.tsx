"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { BreaksTab } from "./breaks-tab";
import { ExceptionsTab } from "./exceptions-tab";
import { HoursTab } from "./hours-tab";
import { RulesTab } from "./rules-tab";
import { VisibilityTab } from "./visibility-tab";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type TabId = "hours" | "exceptions" | "breaks" | "rules" | "visibility";

const TAB_ITEMS: TabItem[] = [
  { id: "hours", label: T.tabs.hours },
  { id: "exceptions", label: T.tabs.exceptions },
  { id: "breaks", label: T.tabs.breaks },
  { id: "rules", label: T.tabs.rules },
  { id: "visibility", label: T.tabs.visibility },
];

const VALID: ReadonlySet<TabId> = new Set(["hours", "exceptions", "breaks", "rules", "visibility"]);

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
  /** Forwarded to the Rules tab so it can render the locked Hot Slots state. */
  hotSlotsAllowed: boolean;
};

/**
 * Client wrapper for the schedule-settings tabs. Reads `?tab=` from the
 * URL and writes back via `router.replace` (no scroll jump). All five
 * tabs (Hours, Exceptions, Breaks, Rules, Visibility) render real content
 * after 25-SETTINGS-C.
 */
export function ScheduleSettingsBody({ initialSnapshot, hotSlotsAllowed }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("tab");
  const active: TabId = raw && VALID.has(raw as TabId) ? (raw as TabId) : "hours";

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "hours") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <Tabs items={TAB_ITEMS} value={active} onChange={setTab} />

      {active === "hours" ? (
        <HoursTab initialSnapshot={initialSnapshot} />
      ) : active === "exceptions" ? (
        <ExceptionsTab initialSnapshot={initialSnapshot} />
      ) : active === "breaks" ? (
        <BreaksTab initialSnapshot={initialSnapshot} />
      ) : active === "rules" ? (
        <RulesTab initialSnapshot={initialSnapshot} hotSlotsAllowed={hotSlotsAllowed} />
      ) : (
        <VisibilityTab initialSnapshot={initialSnapshot} />
      )}
    </div>
  );
}
