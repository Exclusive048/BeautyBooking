"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioPolicyData } from "../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.policy;
const TX = UI_TEXT.studioCabinet.settingsV2.toasts;

type Props = {
  /** Provider id — `/api/studios/[id]` ключуется провайдером, не студией. */
  providerId: string;
  data: StudioPolicyData;
};

type Draft = {
  minBookingHoursAhead: string;
  maxBookingDaysAhead: string;
  cancellationDeadlineHours: string;
  lateCancelAction: string;
  acceptNewClients: boolean;
  remindersEnabled: boolean;
};

function toDraft(data: StudioPolicyData): Draft {
  return {
    minBookingHoursAhead: String(data.minBookingHoursAhead),
    maxBookingDaysAhead: String(data.maxBookingDaysAhead),
    // Пустая строка = «не задано» (в БД null): бесплатная отмена без дедлайна.
    cancellationDeadlineHours:
      data.cancellationDeadlineHours === null ? "" : String(data.cancellationDeadlineHours),
    lateCancelAction: data.lateCancelAction,
    acceptNewClients: data.acceptNewClients,
    remindersEnabled: data.remindersEnabled,
  };
}

function parseIntInRange(raw: string, min: number, max: number): number | null {
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

/**
 * FIX-STUDIO-POLICY-EDITABLE — правила записи студии правятся ЗДЕСЬ.
 *
 * Раньше раздел был read-only и отправлял «изменить в настройках расписания»
 * ссылкой на `/cabinet/studio/calendar`. Редактора правил там нет вовсе, а сам
 * календарь у студии без мастеров пустой — то есть значения по умолчанию были
 * недостижимы, пока в студию не принят хотя бы один мастер. Правила при этом
 * принадлежат провайдеру-студии, а не мастеру, и от наличия команды не зависят.
 *
 * Явная кнопка «Сохранить», а не автосейв: это договорная поверхность (окно
 * записи, срок бесплатной отмены), и здесь уместно подтверждение, а не
 * оптимистичная запись по debounce.
 */
export function PolicyForm({ providerId, data }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseline = toDraft(data);
  const dirty = (Object.keys(baseline) as Array<keyof Draft>).some(
    (key) => draft[key] !== baseline[key],
  );

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!dirty || submitting) return;

    const minHours = parseIntInRange(draft.minBookingHoursAhead, 0, 168);
    if (minHours === null) {
      setError(T.minBookingAheadInvalid);
      return;
    }
    const maxDays = parseIntInRange(draft.maxBookingDaysAhead, 1, 365);
    if (maxDays === null) {
      setError(T.maxBookingAheadInvalid);
      return;
    }
    const freeCancelRaw = draft.cancellationDeadlineHours.trim();
    const freeCancel = freeCancelRaw === "" ? null : parseIntInRange(freeCancelRaw, 0, 168);
    if (freeCancelRaw !== "" && freeCancel === null) {
      setError(T.cancellationDeadlineInvalid);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/studios/${encodeURIComponent(providerId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          minBookingHoursAhead: minHours,
          maxBookingDaysAhead: maxDays,
          cancellationDeadlineHours: freeCancel,
          lateCancelAction: draft.lateCancelAction,
          acceptNewClients: draft.acceptNewClients,
          remindersEnabled: draft.remindersEnabled,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        // Серверная строка курируемая и конкретнее канона — показываем её (FIX-C8).
        setError(body?.error?.message ?? TX.error);
        return;
      }
      router.refresh();
    } catch {
      setError(TX.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={T.minBookingAhead} hint={T.minBookingAheadHint}>
          <div className="flex items-center gap-2">
            <Input
              value={draft.minBookingHoursAhead}
              onChange={(e) => patch("minBookingHoursAhead", e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={0}
              max={168}
            />
            <span className="shrink-0 text-sm text-text-sec">{T.hoursUnit}</span>
          </div>
        </Field>

        <Field label={T.maxBookingAhead} hint={T.maxBookingAheadHint}>
          <div className="flex items-center gap-2">
            <Input
              value={draft.maxBookingDaysAhead}
              onChange={(e) => patch("maxBookingDaysAhead", e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={1}
              max={365}
            />
            <span className="shrink-0 text-sm text-text-sec">{T.daysUnit}</span>
          </div>
        </Field>

        <Field label={T.cancellationDeadline} hint={T.cancellationDeadlineHint}>
          <div className="flex items-center gap-2">
            <Input
              value={draft.cancellationDeadlineHours}
              onChange={(e) => patch("cancellationDeadlineHours", e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={0}
              max={168}
              placeholder={T.notSet}
            />
            <span className="shrink-0 text-sm text-text-sec">{T.hoursUnit}</span>
          </div>
        </Field>

        <Field label={T.lateCancelAction}>
          <Select
            value={draft.lateCancelAction}
            onChange={(e) => patch("lateCancelAction", e.target.value)}
            disabled={submitting}
          >
            <option value="none">{T.lateActions.none}</option>
            <option value="reminder">{T.lateActions.reminder}</option>
            <option value="fine">{T.lateActions.fine}</option>
          </Select>
        </Field>
      </div>

      <ToggleRow
        label={T.acceptNewClients}
        hint={T.acceptNewClientsHint}
        checked={draft.acceptNewClients}
        disabled={submitting}
        onChange={(value) => patch("acceptNewClients", value)}
      />
      <ToggleRow
        label={T.remindersEnabled}
        hint={T.remindersEnabledHint}
        checked={draft.remindersEnabled}
        disabled={submitting}
        onChange={(value) => patch("remindersEnabled", value)}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(toDraft(data));
            setError(null);
          }}
          disabled={!dirty || submitting}
        >
          {UI_TEXT.studioCabinet.settingsV2.cancel}
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!dirty || submitting}>
          {submitting ? T.saving : UI_TEXT.studioCabinet.settingsV2.save}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-text-label">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-text-sec">{hint}</span> : null}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border-subtle bg-bg-input/30 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-main">{label}</p>
        <p className="mt-0.5 text-[11px] text-text-sec">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
