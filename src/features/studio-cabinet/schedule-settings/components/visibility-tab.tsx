"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  ScheduleEditorSnapshot,
  SlotPrecision,
  VisibilityDto,
} from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleSettings.visibility;
const E = UI_TEXT.studioCabinet.scheduleSettings.errors;

type Props = {
  studioId: string;
  masterId: string;
  initialSnapshot: ScheduleEditorSnapshot;
};

const SLOT_PRECISION_OPTIONS: ReadonlyArray<{ value: SlotPrecision; labelKey: keyof typeof T.slotPrecisionLabels }> = [
  { value: "exact", labelKey: "exact" },
  { value: "today_free", labelKey: "today_free" },
  { value: "date_only", labelKey: "date_only" },
];

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase B — Visibility tab.
 *
 * Mirrors master Visibility tab structure but with explicit «Сохранить»
 * (no auto-save — consistent with Hours/Rules in Phase A). Edits
 * Provider-level visibility fields via `{ visibility: VisibilityDto }`
 * body slice through the existing
 * `/api/cabinet/master/schedule?studioId&masterId` endpoint.
 *
 * Fields (`isPublished` — личная видимость мастера — студия не меняет,
 * STUDIO-PAUSE-SPLIT-01; сервер это поле от администратора игнорирует):
 *   - `slotPrecision` — what the public sees («exact time» / «today
 *     has free slots» / «date only»)
 *   - `visibleSlotDays` — booking horizon visible to clients
 *   - `acceptNewClients` — gate booking widget for first-time visitors
 *     (BOOKING-WIDGET-A enforces this in `resolveBookingCore`)
 */
export function VisibilityTab({ studioId, masterId, initialSnapshot }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<VisibilityDto>(initialSnapshot.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const update = (patch: Partial<VisibilityDto>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
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
          body: JSON.stringify({ visibility: draft }),
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
        {/* STUDIO-PAUSE-SPLIT-01: переключателя «Виден в каталоге» здесь больше
            нет — личную страницу мастера скрывает только он сам, а рычаг
            студии — пауза в разделе «Мастера» (`studioPaused`). */}
        <p className="text-xs text-text-sec">{T.personalVisibilityNote}</p>

        <Row title={T.slotPrecisionTitle} hint={T.slotPrecisionHint}>
          <Select
            value={draft.slotPrecision}
            onChange={(e) =>
              update({ slotPrecision: e.target.value as SlotPrecision })
            }
          >
            {SLOT_PRECISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {T.slotPrecisionLabels[opt.labelKey]}
              </option>
            ))}
          </Select>
        </Row>

        <Row title={T.visibleSlotDaysTitle} hint={T.visibleSlotDaysHint}>
          <Input
            type="number"
            min={1}
            max={90}
            value={draft.visibleSlotDays}
            onChange={(e) =>
              update({
                visibleSlotDays: Math.max(1, Number(e.target.value) || 1),
              })
            }
            className="w-24"
          />
        </Row>

        <Row title={T.acceptNewClientsTitle} hint={T.acceptNewClientsHint}>
          <Switch
            size="md"
            checked={draft.acceptNewClients}
            onCheckedChange={(next) => update({ acceptNewClients: next })}
          />
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
