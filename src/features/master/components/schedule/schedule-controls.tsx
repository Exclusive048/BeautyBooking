"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { addWeeks, getWeekStart, toIsoDateKey } from "@/lib/master/schedule-utils";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.controls;

type Props = {
  weekStartIso: string;
};

/**
 * Top-of-page controls — view-toggle (Day/Week/Month, with Day & Month
 * disabled until 25b/c) plus prev/today/next week navigation. Writes
 * `?weekStart=` into the URL via `router.push`; the server page
 * re-fetches with the new range. No client-side state — URL is the
 * source of truth.
 */
export function ScheduleControls({ weekStartIso }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [y, m, d] = weekStartIso.split("-").map((p) => Number.parseInt(p, 10));
  const weekStart = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);

  const navigateTo = (target: Date) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("weekStart", toIsoDateKey(target));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        value="week"
        onChange={() => undefined}
        items={[
          { id: "day", label: T.viewDay, disabled: true, title: T.viewSoon },
          { id: "week", label: T.viewWeek },
          { id: "month", label: T.viewMonth, disabled: true, title: T.viewSoon },
        ]}
      />

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.prevWeek}
          onClick={() => navigateTo(addWeeks(weekStart, -1))}
          className="h-9 w-9 rounded-lg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigateTo(getWeekStart(new Date()))}
          className="rounded-lg"
        >
          <Link href={`?weekStart=${toIsoDateKey(getWeekStart(new Date()))}`}>{T.today}</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.nextWeek}
          onClick={() => navigateTo(addWeeks(weekStart, 1))}
          className="h-9 w-9 rounded-lg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
