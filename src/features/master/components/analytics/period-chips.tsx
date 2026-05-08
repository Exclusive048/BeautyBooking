"use client";

import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MasterAnalyticsPeriodId } from "@/lib/master/analytics-period";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.period;

type ChipDef = {
  id: MasterAnalyticsPeriodId;
  label: string;
};

const CHIPS: ChipDef[] = [
  { id: "7d", label: T.chips.d7 },
  { id: "30d", label: T.chips.d30 },
  { id: "90d", label: T.chips.d90 },
  { id: "year", label: T.chips.year },
  { id: "custom", label: T.chips.custom },
];

type Props = {
  active: MasterAnalyticsPeriodId;
  customAvailable: boolean;
};

/**
 * URL-driven segmented control for the analytics period. Uses
 * `router.replace` so the back stack stays clean — switching periods
 * isn't a navigation in the user's mental model.
 *
 * `custom` is a placeholder in 30a — it surfaces a transient alert
 * instead of opening a real picker. The `customAvailable` flag is wired
 * to the master's plan but currently always shows the lock icon (the
 * picker itself isn't built yet).
 */
export function PeriodChips({ active, customAvailable }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (id: MasterAnalyticsPeriodId) => {
    if (id === "custom") {
      window.alert(T.customSoon);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-page p-1">
      {CHIPS.map((chip) => {
        const isActive = chip.id === active;
        const isLockedCustom = chip.id === "custom" && !customAvailable;
        return (
          <Button
            key={chip.id}
            type="button"
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleSelect(chip.id)}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-bg-card text-text-main shadow-card"
                : "border-transparent bg-transparent text-text-sec hover:text-text-main",
              isLockedCustom && "opacity-70"
            )}
          >
            {chip.label}
            {chip.id === "custom" && !customAvailable ? (
              <Lock className="ml-1.5 h-3 w-3 text-text-sec" aria-hidden />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
