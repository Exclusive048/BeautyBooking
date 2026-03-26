"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";

type RequestItem = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  provider: { id: string; name: string };
};

type ScheduleBreak = { startLocal: string; endLocal: string };

type ScheduleTemplate = {
  id?: string;
  clientId: string;
  name: string;
  startLocal: string;
  endLocal: string;
  breaks?: ScheduleBreak[];
};

type WeeklyDay = { weekday: number; templateId: string | null; isActive: boolean };

type ScheduleOverride = {
  date: string;
  type: "OFF" | "TIME_RANGE" | "TEMPLATE";
  startLocal?: string | null;
  endLocal?: string | null;
  templateId?: string | null;
  isActive?: boolean | null;
  breaks?: ScheduleBreak[];
};

type SchedulePayload = {
  templates: ScheduleTemplate[];
  weekly: { days: WeeklyDay[] };
  overrides: ScheduleOverride[];
};

type EditorBreak = { start: string; end: string };
type EditorDaySchedule = {
  dayOfWeek: number;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: EditorBreak[];
  fixedSlotTimes: string[];
};
type EditorException = {
  date: string;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: EditorBreak[];
  fixedSlotTimes: string[];
};
type EditorRequestPayload = {
  format: "EDITOR_V1";
  weekSchedule: EditorDaySchedule[];
  exceptions: EditorException[];
};

type RequestDetails = {
  request: {
    id: string;
    status: string;
    comment: string | null;
    createdAt: string;
    provider: { id: string; name: string };
    payload: SchedulePayload | EditorRequestPayload;
  };
  current: {
    templates: Array<{
      id: string;
      name: string;
      startLocal: string;
      endLocal: string;
      breaks: ScheduleBreak[];
    }>;
    weekly: { days: WeeklyDay[] };
    overrides: ScheduleOverride[];
    month: string;
    editorSnapshot: {
      weekSchedule: EditorDaySchedule[];
      exceptions: Array<EditorException & { id: string }>;
    };
  };
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function buildMonthGrid(month: string): Array<{ dateKey: string; inMonth: boolean }> {
  const base = new Date(`${month}-01T00:00:00.000Z`);
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const day = start.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const inMonth = date.getUTCMonth() === base.getUTCMonth();
    return { dateKey, inMonth };
  });
}

function toWeekday(dateKey: string): number {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function resolveDay(input: {
  templates: ScheduleTemplate[];
  weekly: { days: WeeklyDay[] };
  overrides: ScheduleOverride[];
  dateKey: string;
}): { isWorking: boolean; startLocal: string | null; endLocal: string | null; breaks: ScheduleBreak[] } {
  const templatesById = new Map<string, ScheduleTemplate>();
  input.templates.forEach((template) => {
    templatesById.set(template.id ?? template.clientId, template);
    templatesById.set(template.clientId, template);
  });

  const override = input.overrides.find((item) => item.date === input.dateKey);
  if (override?.type === "OFF") {
    return { isWorking: false, startLocal: null, endLocal: null, breaks: [] };
  }
  if (override?.type === "TIME_RANGE") {
    return {
      isWorking: true,
      startLocal: override.startLocal ?? null,
      endLocal: override.endLocal ?? null,
      breaks: override.breaks ?? [],
    };
  }
  if (override?.type === "TEMPLATE") {
    if (!override.isActive || !override.templateId) {
      return { isWorking: false, startLocal: null, endLocal: null, breaks: [] };
    }
    const template = templatesById.get(override.templateId);
    return {
      isWorking: Boolean(template),
      startLocal: template?.startLocal ?? null,
      endLocal: template?.endLocal ?? null,
      breaks: template?.breaks ?? [],
    };
  }

  const weekday = toWeekday(input.dateKey);
  const weekly = input.weekly.days.find((item) => item.weekday === weekday);
  if (!weekly?.templateId || !weekly.isActive) {
    return { isWorking: false, startLocal: null, endLocal: null, breaks: [] };
  }
  const template = templatesById.get(weekly.templateId);
  return {
    isWorking: Boolean(template),
    startLocal: template?.startLocal ?? null,
    endLocal: template?.endLocal ?? null,
    breaks: template?.breaks ?? [],
  };
}

function isEditorRequestPayload(value: SchedulePayload | EditorRequestPayload): value is EditorRequestPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "format" in value &&
    value.format === "EDITOR_V1" &&
    Array.isArray(value.weekSchedule) &&
    Array.isArray(value.exceptions)
  );
}

function resolveEditorDay(input: {
  weekSchedule: EditorDaySchedule[];
  exceptions: EditorException[];
  dateKey: string;
}): {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: EditorBreak[];
  fixedSlotTimes: string[];
} {
  const day = new Date(`${input.dateKey}T00:00:00.000Z`).getUTCDay();
  const dayOfWeek = day === 0 ? 6 : day - 1;
  const base = input.weekSchedule.find((item) => item.dayOfWeek === dayOfWeek) ?? null;
  const exception = input.exceptions.find((item) => item.date === input.dateKey) ?? null;

  if (exception) {
    return {
      isWorkday: exception.isWorkday,
      scheduleMode: exception.scheduleMode,
      startTime: exception.startTime,
      endTime: exception.endTime,
      breaks: exception.breaks ?? [],
      fixedSlotTimes: exception.fixedSlotTimes ?? [],
    };
  }

  if (!base) {
    return {
      isWorkday: false,
      scheduleMode: "FLEXIBLE",
      startTime: null,
      endTime: null,
      breaks: [],
      fixedSlotTimes: [],
    };
  }

  return {
    isWorkday: base.isWorkday,
    scheduleMode: base.scheduleMode,
    startTime: base.startTime,
    endTime: base.endTime,
    breaks: base.breaks ?? [],
    fixedSlotTimes: base.fixedSlotTimes ?? [],
  };
}

export function ScheduleRequestsPanel() {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<RequestDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/schedule/requests?status=pending", { cache: "no-store" });
      if (res.status === 403) {
        setHidden(true);
        setLoading(false);
        return;
      }
      const json = (await res.json().catch(() => null)) as ApiResponse<{ requests: RequestItem[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setRequests(json.data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить запросы");
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (id: string): Promise<void> => {
    setDetailsLoading(true);
    setActionError(null);
    try {
      const query = new URLSearchParams({ month: monthKey() });
      const res = await fetch(`/api/studio/schedule/requests/${id}?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<RequestDetails> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setDetails(json.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось загрузить детали запроса");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      setComment("");
      return;
    }
    void loadDetails(selectedId);
  }, [selectedId]);

  const calendar = useMemo(() => {
    if (!details) return [];
    return buildMonthGrid(details.current.month);
  }, [details]);

  const diffs = useMemo(() => {
    if (!details) return new Set<string>();
    const changed = new Set<string>();
    const payload = details.request.payload;
    if (isEditorRequestPayload(payload)) {
      const currentSnapshot = details.current.editorSnapshot;
      for (const { dateKey } of calendar) {
        const planned = resolveEditorDay({
          weekSchedule: currentSnapshot.weekSchedule,
          exceptions: currentSnapshot.exceptions,
          dateKey,
        });
        const draft = resolveEditorDay({
          weekSchedule: payload.weekSchedule,
          exceptions: payload.exceptions,
          dateKey,
        });
        const plannedKey = JSON.stringify({
          isWorkday: planned.isWorkday,
          scheduleMode: planned.scheduleMode,
          startTime: planned.startTime,
          endTime: planned.endTime,
          breaks: planned.breaks,
          fixedSlotTimes: [...planned.fixedSlotTimes].sort(),
        });
        const draftKey = JSON.stringify({
          isWorkday: draft.isWorkday,
          scheduleMode: draft.scheduleMode,
          startTime: draft.startTime,
          endTime: draft.endTime,
          breaks: draft.breaks,
          fixedSlotTimes: [...draft.fixedSlotTimes].sort(),
        });
        if (plannedKey !== draftKey) {
          changed.add(dateKey);
        }
      }
      return changed;
    }

    const current = details.current;
    for (const { dateKey } of calendar) {
      const planned = resolveDay({
        templates: current.templates.map((item) => ({ ...item, clientId: item.id })),
        weekly: current.weekly,
        overrides: current.overrides,
        dateKey,
      });
      const draft = resolveDay({
        templates: payload.templates,
        weekly: payload.weekly,
        overrides: payload.overrides,
        dateKey,
      });
      const plannedKey = `${planned.isWorking}-${planned.startLocal}-${planned.endLocal}-${JSON.stringify(planned.breaks)}`;
      const draftKey = `${draft.isWorking}-${draft.startLocal}-${draft.endLocal}-${JSON.stringify(draft.breaks)}`;
      if (plannedKey !== draftKey) {
        changed.add(dateKey);
      }
    }
    return changed;
  }, [calendar, details]);

  const approve = async (): Promise<void> => {
    if (!selectedId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/schedule/requests/${selectedId}/approve`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setSelectedId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось утвердить запрос");
    } finally {
      setActionBusy(false);
    }
  };

  const reject = async (): Promise<void> => {
    if (!selectedId) return;
    if (!comment.trim()) {
      setActionError("Укажите комментарий для отклонения.");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/schedule/requests/${selectedId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setSelectedId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось отклонить запрос");
    } finally {
      setActionBusy(false);
    }
  };

  if (hidden) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-text-main">Запросы на график</h3>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          Обновить
        </Button>
      </div>

      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

      {loading ? (
        <div className="lux-card rounded-[24px] p-4 text-sm text-text-sec">Загружаем запросы...</div>
      ) : requests.length === 0 ? (
        <div className="lux-card rounded-[24px] p-4 text-sm text-text-sec">Нет запросов на согласование.</div>
      ) : (
        <div className="grid gap-3">
          {requests.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className="lux-card rounded-[24px] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-main">{item.provider.name}</div>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Ожидает
                </span>
              </div>
              <div className="mt-1 text-xs text-text-sec">
                {UI_FMT.dateTimeLong(item.createdAt, { timeZone: viewerTimeZone })}
              </div>
            </button>
          ))}
        </div>
      )}

      <ModalSurface open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-main">Согласование графика</h3>
            <p className="text-xs text-text-sec">
              {details?.request.provider.name ?? "Мастер"} ·{" "}
              {details ? UI_FMT.dateTimeLong(details.request.createdAt, { timeZone: viewerTimeZone }) : ""}
            </p>
          </div>

          {detailsLoading ? (
            <div className="text-sm text-text-sec">Загружаем детали...</div>
          ) : details ? (
            <>
              <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
                <div className="grid grid-cols-7 gap-2 text-xs text-text-sec">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="text-center">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {calendar.map(({ dateKey, inMonth }) => {
                    const isChanged = diffs.has(dateKey);
                    return (
                      <div
                        key={dateKey}
                        className={`min-h-[70px] rounded-2xl border border-border-subtle/70 p-2 text-[11px] ${
                          inMonth ? "bg-bg-card" : "bg-bg-input text-text-sec"
                        } ${isChanged ? "ring-2 ring-primary/40" : ""}`}
                      >
                        <div className="text-xs font-semibold">{dateKey.slice(8, 10)}</div>
                        {isChanged ? <div className="mt-1 text-primary">Изменение</div> : <div className="mt-1 text-text-sec">—</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {actionError ? (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{actionError}</div>
              ) : null}

              <Textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий при отклонении"
              />

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setSelectedId(null)} disabled={actionBusy}>
                  Закрыть
                </Button>
                <Button variant="danger" onClick={() => void reject()} disabled={actionBusy}>
                  Отклонить
                </Button>
                <Button onClick={() => void approve()} disabled={actionBusy}>
                  Утвердить
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-text-sec">Нет данных по запросу.</div>
          )}
        </div>
      </ModalSurface>
    </section>
  );
}
