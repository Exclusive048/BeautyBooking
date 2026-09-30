"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import {
  BOOKING_RULE_LIMITS,
  type BookingRulesDto,
  type ScheduleEditorSnapshot,
} from "@/lib/schedule/editor-shared";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.rules;
const E = UI_TEXT.studioCabinet.scheduleSettings.errors;

type Props = {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — Rules tab.
 *
 * Edits Provider-level booking rules:
 *   - `minHoursAhead` — earliest a client may book before start
 *   - `maxDaysAhead` — booking horizon
 *   - `autoConfirm` — auto-confirm new bookings without master action
 *   - `freeCancelHours` — free-cancel deadline (null = no deadline)
 *
 * Save goes through the existing `/api/cabinet/master/schedule`
 * endpoint with `?studioId&masterId` query params (`STUDIO_ADMIN`
 * actor mode). The endpoint normalizes via `normalizeBookingRules`
 * and writes Provider columns. Subsequent booking flows
 * automatically pick up the new values — `assertBookingWindow`
 * (BOOKING-WIDGET-A) reads them at booking time.
 */
export function RulesTab({ studioId, masterId, initialSnapshot }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<BookingRulesDto>(
    initialSnapshot.bookingRules,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const update = (patch: Partial<BookingRulesDto>) => {
    setRules((prev) => ({ ...prev, ...patch }));
    setSavedAt(null);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId, masterId });
      await fetchJsonWithAuth<unknown>(
        `/api/cabinet/master/schedule?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingRules: rules }),
        },
      );
      setSavedAt(Date.now());
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.save));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-5">
        <Row title={T.minHoursTitle} hint={T.minHoursHint}>
          <NumberInput
            min={BOOKING_RULE_LIMITS.minHoursAhead.min}
            max={BOOKING_RULE_LIMITS.minHoursAhead.max}
            fallback={BOOKING_RULE_LIMITS.minHoursAhead.fallback}
            value={rules.minHoursAhead}
            onValueChange={(next) => update({ minHoursAhead: next })}
            aria-label={T.minHoursTitle}
            className="w-24"
          />
        </Row>

        <Row title={T.maxDaysTitle} hint={T.maxDaysHint}>
          <NumberInput
            min={BOOKING_RULE_LIMITS.maxDaysAhead.min}
            max={BOOKING_RULE_LIMITS.maxDaysAhead.max}
            fallback={BOOKING_RULE_LIMITS.maxDaysAhead.fallback}
            value={rules.maxDaysAhead}
            onValueChange={(next) => update({ maxDaysAhead: next })}
            aria-label={T.maxDaysTitle}
            className="w-24"
          />
        </Row>

        <Row title={T.autoConfirmTitle} hint={T.autoConfirmHint}>
          <Switch
            size="md"
            checked={rules.autoConfirm}
            onCheckedChange={(next) => update({ autoConfirm: next })}
          />
        </Row>

        <Row title={T.freeCancelTitle} hint={T.freeCancelHint}>
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={rules.freeCancelHours !== null}
              onCheckedChange={(next) =>
                update({
                  freeCancelHours: next
                    ? BOOKING_RULE_LIMITS.freeCancelHours.fallback
                    : null,
                })
              }
              aria-label={T.freeCancelToggleAria}
            />
            {rules.freeCancelHours !== null ? (
              <NumberInput
                min={1}
                max={BOOKING_RULE_LIMITS.freeCancelHours.max}
                fallback={BOOKING_RULE_LIMITS.freeCancelHours.fallback}
                value={rules.freeCancelHours}
                onValueChange={(next) => update({ freeCancelHours: next })}
                aria-label={T.freeCancelTitle}
                className="w-20"
              />
            ) : null}
          </div>
        </Row>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {savedAt ? (
          <p className="text-xs text-success-text">
            {T.savedHint}
          </p>
        ) : (
          <span aria-hidden />
        )}
        <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
          {saving ? T.savingLabel : T.saveLabel}
        </Button>
      </div>
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-main">{title}</p>
        <p className="mt-0.5 text-xs text-text-sec">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
