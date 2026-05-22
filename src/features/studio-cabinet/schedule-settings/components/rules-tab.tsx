"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  BookingRulesDto,
  ScheduleEditorSnapshot,
} from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

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
      const response = await fetch(
        `/api/cabinet/master/schedule?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingRules: rules }),
        },
      );
      const json = (await response.json().catch(() => null)) as
        | ApiResponse<unknown>
        | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : E.save;
        setError(message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError(E.save);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-5">
        <Row title={T.minHoursTitle} hint={T.minHoursHint}>
          <Input
            type="number"
            min={0}
            max={168}
            value={rules.minHoursAhead}
            onChange={(e) =>
              update({ minHoursAhead: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-24"
          />
        </Row>

        <Row title={T.maxDaysTitle} hint={T.maxDaysHint}>
          <Input
            type="number"
            min={1}
            max={365}
            value={rules.maxDaysAhead}
            onChange={(e) =>
              update({ maxDaysAhead: Math.max(1, Number(e.target.value) || 1) })
            }
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
                update({ freeCancelHours: next ? 24 : null })
              }
              aria-label={T.freeCancelToggleAria}
            />
            {rules.freeCancelHours !== null ? (
              <Input
                type="number"
                min={1}
                max={168}
                value={rules.freeCancelHours}
                onChange={(e) =>
                  update({
                    freeCancelHours: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-20"
              />
            ) : null}
          </div>
        </Row>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {savedAt ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
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
