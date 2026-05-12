"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  rangeFromKey: string;
  rangeToKey: string;
};

/**
 * URL-driven segmented control for the analytics period (fix-02).
 *
 * Switching presets uses `router.replace` so the back stack stays
 * clean. `custom` now opens an inline date-range popover instead of
 * the legacy alert — submits a `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`
 * triple. The chip stays locked behind `customAvailable` (plan-gated).
 */
export function PeriodChips({ active, customAvailable, rangeFromKey, rangeToKey }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Hydrate the picker inputs from the active range. React 19
  // "compare during render" pattern — sync to props without useEffect
  // so the lint rule (and React's docs) stay happy.
  const [fromValue, setFromValue] = useState(rangeFromKey);
  const [toValue, setToValue] = useState(rangeToKey);
  const [prevRangeKeys, setPrevRangeKeys] = useState({
    from: rangeFromKey,
    to: rangeToKey,
  });
  if (prevRangeKeys.from !== rangeFromKey || prevRangeKeys.to !== rangeToKey) {
    setPrevRangeKeys({ from: rangeFromKey, to: rangeToKey });
    setFromValue(rangeFromKey);
    setToValue(rangeToKey);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const handleSelect = (id: MasterAnalyticsPeriodId) => {
    if (id === "custom") {
      if (!customAvailable) return;
      setPickerOpen(true);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    params.delete("from");
    params.delete("to");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleApplyCustom = () => {
    if (!fromValue || !toValue) return;
    if (toValue < fromValue) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "custom");
    params.set("from", fromValue);
    params.set("to", toValue);
    router.replace(`?${params.toString()}`, { scroll: false });
    setPickerOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-page p-1">
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
            disabled={isLockedCustom}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-bg-card text-text-main shadow-card"
                : "border-transparent bg-transparent text-text-sec hover:text-text-main",
              isLockedCustom && "opacity-70",
            )}
          >
            {chip.label}
            {chip.id === "custom" && !customAvailable ? (
              <Lock className="ml-1.5 h-3 w-3 text-text-sec" aria-hidden />
            ) : null}
          </Button>
        );
      })}

      {pickerOpen ? (
        <div
          ref={popoverRef}
          role="dialog"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-xl border border-border-subtle bg-bg-card p-3 shadow-card"
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.customPickerHeading}
          </p>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-text-sec">{T.customFromLabel}</span>
              <Input
                type="date"
                value={fromValue}
                max={toValue || undefined}
                onChange={(event) => setFromValue(event.target.value)}
                className="h-9 rounded-lg px-2 text-sm"
              />
            </label>
            <span className="pb-2.5 text-sm text-text-sec">—</span>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-text-sec">{T.customToLabel}</span>
              <Input
                type="date"
                value={toValue}
                min={fromValue || undefined}
                onChange={(event) => setToValue(event.target.value)}
                className="h-9 rounded-lg px-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPickerOpen(false)}
            >
              {T.customCancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApplyCustom}
              disabled={!fromValue || !toValue || toValue < fromValue}
            >
              {T.customApply}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
