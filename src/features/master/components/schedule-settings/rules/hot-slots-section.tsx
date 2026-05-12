"use client";

import Link from "next/link";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { HotSlotsDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { ChipGroup } from "../components/chip-group";
import { SettingRow } from "../components/setting-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings.rules.hotSlots;

const TRIGGER_OPTIONS = [
  { value: 1, label: T.triggerOptions["1"] },
  { value: 2, label: T.triggerOptions["2"] },
  { value: 3, label: T.triggerOptions["3"] },
  { value: 6, label: T.triggerOptions["6"] },
];

const DISCOUNT_OPTIONS = [
  { value: 10, label: T.discountOptions["10"] },
  { value: 15, label: T.discountOptions["15"] },
  { value: 20, label: T.discountOptions["20"] },
  { value: 30, label: T.discountOptions["30"] },
];

const DEFAULT_HOT_SLOTS: HotSlotsDto = {
  triggerHours: 3,
  discountValue: 20,
  applyMode: "ALL_SERVICES",
};

type Props = {
  hotSlots: HotSlotsDto | null;
  onChange: (next: HotSlotsDto | null) => void;
  isLocked: boolean;
};

/**
 * "Горящие окошки" — toggle + sub-controls.
 *
 * Toggle on (`hotSlots: HotSlotsDto`) → DiscountRule.isEnabled = true on save.
 * Toggle off (`hotSlots: null`) → DiscountRule.isEnabled = false (row preserved).
 *
 * `applyMode` is hidden in this UI (always defaults to ALL_SERVICES);
 * detailed mode + service picking lives on the dedicated hot-slots page.
 *
 * `isLocked = true` (non-PRO plan) renders the locked variant — toggle
 * disabled, link to billing. The frontend gate is informational; the
 * backend re-checks billing in the PATCH handler.
 */
export function HotSlotsSection({ hotSlots, onChange, isLocked }: Props) {
  const enabled = hotSlots !== null;

  if (isLocked) {
    return (
      <section className="rounded-2xl border border-dashed border-border-subtle bg-bg-card p-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-sec" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide text-text-sec">
            {T.badge}
          </span>
        </div>
        <h2 className="mt-2 font-display text-lg text-text-sec">{T.title}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-sec">{T.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-input px-2.5 py-1 text-xs text-text-sec">
            <Lock className="h-3 w-3" aria-hidden />
            {T.locked}
          </span>
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href="/cabinet/billing">{T.lockedCta}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 transition-colors",
          enabled
            ? "border-transparent bg-brand-gradient text-white shadow-card"
            : "border-border-subtle bg-bg-card"
        )}
      >
        {enabled ? (
          <>
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-2xl"
              aria-hidden
            />
          </>
        ) : null}

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                enabled ? "bg-white/15 text-white" : "bg-bg-input text-text-sec"
              )}
            >
              <Zap className="h-3 w-3" aria-hidden />
              {T.badge}
            </span>
            <h2
              className={cn(
                "mt-2 font-display text-lg",
                enabled ? "text-white" : "text-text-main"
              )}
            >
              {T.title}
            </h2>
            <p
              className={cn(
                "mt-1 max-w-prose text-sm",
                enabled ? "text-white/85" : "text-text-sec"
              )}
            >
              {T.body}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => onChange(next ? DEFAULT_HOT_SLOTS : null)}
            aria-label={T.title}
          />
        </div>
      </div>

      {enabled ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5">
          <div className="divide-y divide-border-subtle">
            <SettingRow
              title={T.triggerTitle}
              subtitle={T.triggerSubtitle}
              control={
                <ChipGroup
                  value={hotSlots.triggerHours}
                  onChange={(value) => onChange({ ...hotSlots, triggerHours: value })}
                  options={TRIGGER_OPTIONS}
                />
              }
            />
            <SettingRow
              title={T.discountTitle}
              subtitle={T.discountSubtitle}
              control={
                <ChipGroup
                  value={hotSlots.discountValue}
                  onChange={(value) => onChange({ ...hotSlots, discountValue: value })}
                  options={DISCOUNT_OPTIONS}
                />
              }
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
