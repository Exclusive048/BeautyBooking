"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { buildTimezoneOptions } from "@/lib/ui/timezone-options";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile.location;

type Status = "idle" | "saving" | "saved" | "error";

/**
 * FIX-R2-02-A — explicit timezone override for the master.
 *
 * Defaults to the city-derived `Provider.timezone`. Persists immediately on
 * change via `PATCH /api/master/profile` (cabinet auto-save pattern). The whole
 * booking-time arc (slots / today / reminders / salon-tz label) reads this
 * value, so getting it right matters — the selector is the safety override when
 * the city-derived guess doesn't fit.
 */
export function TimezoneSelector({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState<Status>("idle");
  const options = buildTimezoneOptions(current);

  const save = async (next: string) => {
    const previous = value;
    setValue(next);
    setStatus("saving");
    try {
      const response = await fetch("/api/master/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: next }),
      });
      if (!response.ok) {
        setValue(previous);
        setStatus("error");
        return;
      }
      setStatus("saved");
      router.refresh();
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setValue(previous);
      setStatus("error");
    }
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.timezoneLabel}
          </p>
          <span className="font-mono text-[10px] text-text-sec">· {T.timezoneAutoHint}</span>
          {status === "saving" ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-text-sec">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {T.timezoneSaving}
            </span>
          ) : null}
          {status === "saved" ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden /> {T.timezoneSaved}
            </span>
          ) : null}
        </div>
        <Select
          aria-label={T.timezoneLabel}
          className="mt-1.5 max-w-sm"
          value={value}
          onChange={(event) => save(event.target.value)}
          disabled={status === "saving"}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p className={cn("mt-1.5 text-[11px]", status === "error" ? "text-red-600 dark:text-red-400" : "text-text-sec")}>
          {status === "error" ? T.timezoneError : T.timezoneHint}
        </p>
      </div>
    </div>
  );
}
