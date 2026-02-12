"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";

type ScheduleBreak = {
  startLocal: string;
  endLocal: string;
};

type ScheduleTemplate = {
  clientId: string;
  id?: string;
  name: string;
  startLocal: string;
  endLocal: string;
  breaks: ScheduleBreak[];
  color?: string | null;
};

type WeeklyDay = {
  weekday: number;
  templateId: string | null;
  isActive: boolean;
};

type ScheduleOverride = {
  date: string;
  type: "OFF" | "TIME_RANGE" | "TEMPLATE";
  startLocal?: string | null;
  endLocal?: string | null;
  templateId?: string | null;
  isActive?: boolean | null;
  breaks?: ScheduleBreak[];
};

type StatusPayload = {
  mode: "solo" | "studio_member";
  requestStatus?: "PENDING" | "REJECTED" | "APPROVED" | null;
  pendingRequestId?: string | null;
  rejectedComment?: string | null;
};

type SchedulePayload = {
  templates: Array<{
    clientId: string;
    id?: string;
    name: string;
    startLocal: string;
    endLocal: string;
    breaks: ScheduleBreak[];
    color?: string | null;
  }>;
  weekly: { days: WeeklyDay[] };
  overrides: ScheduleOverride[];
  removedOverrides?: string[];
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const EMPTY_OVERRIDES: ScheduleOverride[] = [];

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthTitle(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function monthShift(monthKey: string, delta: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function buildMonthGrid(monthKey: string): Array<{ dateKey: string; inMonth: boolean }> {
  const base = new Date(`${monthKey}-01T00:00:00.000Z`);
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

function formatPlanLabel(input: {
  isWorking: boolean;
  startLocal: string | null;
  endLocal: string | null;
  templateName?: string | null;
  kind?: "weekly" | "override";
}): string {
  if (!input.isWorking) return "Выходной";
  if (input.templateName) {
    return `${input.templateName} (${input.startLocal ?? "—"}–${input.endLocal ?? "—"})`;
  }
  if (input.startLocal && input.endLocal) {
    return `Смена ${input.startLocal}–${input.endLocal}`;
  }
  return "Рабочий день";
}

function createClientId(): string {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBreaks(input: ScheduleBreak[]): ScheduleBreak[] {
  return input
    .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal }))
    .filter((item) => item.startLocal && item.endLocal);
}

export function ScheduleBuilder() {
  const [status, setStatus] = useState<StatusPayload>({ mode: "solo" });
  const [tab, setTab] = useState<"templates" | "week" | "overrides">("templates");
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState(`${currentMonthKey()}-01`);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>(
    Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      templateId: null,
      isActive: false,
    }))
  );
  const [overridesByMonth, setOverridesByMonth] = useState<Record<string, ScheduleOverride[]>>({});
  const [initialTemplates, setInitialTemplates] = useState<ScheduleTemplate[]>([]);
  const [initialWeeklyDays, setInitialWeeklyDays] = useState<WeeklyDay[]>([]);
  const [initialOverridesByMonth, setInitialOverridesByMonth] = useState<Record<string, ScheduleOverride[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [templateDraft, setTemplateDraft] = useState<ScheduleTemplate>({
    clientId: createClientId(),
    name: "",
    startLocal: "10:00",
    endLocal: "19:00",
    breaks: [],
    color: null,
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const [rangeStart, setRangeStart] = useState("10:00");
  const [rangeEnd, setRangeEnd] = useState("19:00");
  const [rangeBreaks, setRangeBreaks] = useState<ScheduleBreak[]>([]);

  const monthOverrides = overridesByMonth[month];
  const overrides = useMemo(() => monthOverrides ?? EMPTY_OVERRIDES, [monthOverrides]);

  const readOnly = status.mode === "studio_member" && status.requestStatus === "PENDING";

  const templatesById = useMemo(() => {
    return new Map(templates.map((item) => [item.clientId, item]));
  }, [templates]);

  const weeklyByDay = useMemo(() => {
    const map = new Map<number, WeeklyDay>();
    weeklyDays.forEach((day) => map.set(day.weekday, day));
    return map;
  }, [weeklyDays]);

  const overridesByDate = useMemo(() => {
    const map = new Map<string, ScheduleOverride>();
    overrides.forEach((item) => map.set(item.date, item));
    return map;
  }, [overrides]);

  const selectedOverride = overridesByDate.get(selectedDate) ?? null;
  const selectedWeeklyTemplateId = weeklyByDay.get(toWeekday(selectedDate))?.templateId ?? null;

  const selectedBasePlan = useMemo(() => {
    const weekday = toWeekday(selectedDate);
    const day = weeklyByDay.get(weekday);
    if (!day || !day.templateId) {
      return { isWorking: false, startLocal: null, endLocal: null, templateName: null };
    }
    const template = templatesById.get(day.templateId);
    if (!template || !day.isActive) {
      return { isWorking: false, startLocal: null, endLocal: null, templateName: null };
    }
    return {
      isWorking: true,
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      templateName: template.name,
    };
  }, [selectedDate, templatesById, weeklyByDay]);

  const selectedResolved = useMemo(() => {
    const override = selectedOverride;
    if (override?.type === "OFF") {
      return { isWorking: false, startLocal: null, endLocal: null, templateName: null, kind: "override" as const };
    }
    if (override?.type === "TIME_RANGE") {
      return {
        isWorking: true,
        startLocal: override.startLocal ?? null,
        endLocal: override.endLocal ?? null,
        templateName: "Кастом",
        kind: "override" as const,
      };
    }
    if (override?.type === "TEMPLATE") {
      if (!override.isActive || !override.templateId) {
        return { isWorking: false, startLocal: null, endLocal: null, templateName: null, kind: "override" as const };
      }
      const template = templatesById.get(override.templateId);
      return {
        isWorking: Boolean(template),
        startLocal: template?.startLocal ?? null,
        endLocal: template?.endLocal ?? null,
        templateName: template?.name ?? "Шаблон",
        kind: "override" as const,
      };
    }
    return { ...selectedBasePlan, kind: "weekly" as const };
  }, [selectedBasePlan, selectedOverride, templatesById]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, templatesRes, weeklyRes] = await Promise.all([
        fetch("/api/provider/schedule/status", { cache: "no-store" }),
        fetch("/api/provider/schedule/templates", { cache: "no-store" }),
        fetch("/api/provider/schedule/weekly", { cache: "no-store" }),
      ]);

      const statusJson = (await statusRes.json().catch(() => null)) as ApiResponse<StatusPayload> | null;
      if (!statusRes.ok || !statusJson || !statusJson.ok) {
        throw new Error(statusJson && !statusJson.ok ? statusJson.error.message : `API error: ${statusRes.status}`);
      }

      const templatesJson = (await templatesRes.json().catch(() => null)) as
        | ApiResponse<{ templates: ScheduleTemplate[] }>
        | null;
      if (!templatesRes.ok || !templatesJson || !templatesJson.ok) {
        throw new Error(
          templatesJson && !templatesJson.ok ? templatesJson.error.message : `API error: ${templatesRes.status}`
        );
      }

      const weeklyJson = (await weeklyRes.json().catch(() => null)) as ApiResponse<{ days: WeeklyDay[] }> | null;
      if (!weeklyRes.ok || !weeklyJson || !weeklyJson.ok) {
        throw new Error(weeklyJson && !weeklyJson.ok ? weeklyJson.error.message : `API error: ${weeklyRes.status}`);
      }

      const templateItems = templatesJson.data.templates.map((item) => ({
        ...item,
        clientId: item.id ?? createClientId(),
        breaks: item.breaks ?? [],
      }));
      const weeklyItems = weeklyJson.data.days;

      setStatus(statusJson.data);
      setTemplates(templateItems);
      setWeeklyDays(weeklyItems);
      setInitialTemplates(templateItems);
      setInitialWeeklyDays(weeklyItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить график");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOverrides = useCallback(
    async (monthKey: string): Promise<void> => {
      if (overridesByMonth[monthKey]) return;
      try {
        const query = new URLSearchParams({ month: monthKey });
        const res = await fetch(`/api/provider/schedule/overrides?${query.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ overrides: ScheduleOverride[] }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setOverridesByMonth((current) => ({ ...current, [monthKey]: json.data.overrides }));
        setInitialOverridesByMonth((current) => ({ ...current, [monthKey]: json.data.overrides }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить исключения");
      }
    },
    [overridesByMonth]
  );

  const setRangeFromTemplate = useCallback(
    (templateId?: string | null) => {
      if (!templateId) return;
      const template = templatesById.get(templateId);
      if (!template) return;
      setRangeStart(template.startLocal);
      setRangeEnd(template.endLocal);
      setRangeBreaks(template.breaks ?? []);
    },
    [templatesById]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOverrides(month);
  }, [month, loadOverrides]);

  useEffect(() => {
    if (selectedDate.startsWith(`${month}-`)) return;
    setSelectedDate(`${month}-01`);
  }, [month, selectedDate]);

  useEffect(() => {
    if (selectedOverride?.type === "TIME_RANGE") {
      setRangeStart(selectedOverride.startLocal ?? "10:00");
      setRangeEnd(selectedOverride.endLocal ?? "19:00");
      setRangeBreaks(selectedOverride.breaks ?? []);
      return;
    }
    if (selectedWeeklyTemplateId) {
      setRangeFromTemplate(selectedWeeklyTemplateId);
    }
  }, [
    selectedDate,
    selectedOverride?.type,
    selectedOverride?.startLocal,
    selectedOverride?.endLocal,
    selectedOverride?.breaks,
    selectedWeeklyTemplateId,
    setRangeFromTemplate,
  ]);

  const updateWeeklyDay = (weekday: number, next: Partial<WeeklyDay>) => {
    setWeeklyDays((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day;
        const templateId = next.templateId !== undefined ? next.templateId : day.templateId;
        const isActive = next.isActive !== undefined ? next.isActive : day.isActive;
        return {
          ...day,
          templateId,
          isActive: templateId ? isActive : false,
        };
      })
    );
  };

  const updateOverride = (dateKey: string, override: ScheduleOverride) => {
    setOverridesByMonth((current) => {
      const list = current[month] ?? [];
      const next = list.filter((item) => item.date !== dateKey);
      next.push({ ...override, date: dateKey });
      next.sort((a, b) => a.date.localeCompare(b.date));
      return { ...current, [month]: next };
    });
  };

  const removeOverride = (dateKey: string) => {
    setOverridesByMonth((current) => {
      const list = current[month] ?? [];
      return { ...current, [month]: list.filter((item) => item.date !== dateKey) };
    });
  };

  const resetTemplateDraft = () => {
    setTemplateDraft({
      clientId: createClientId(),
      name: "",
      startLocal: "10:00",
      endLocal: "19:00",
      breaks: [],
      color: null,
    });
    setEditingTemplateId(null);
  };

  const startEditTemplate = (template: ScheduleTemplate) => {
    setTemplateDraft({ ...template, breaks: template.breaks ?? [] });
    setEditingTemplateId(template.clientId);
  };

  const upsertTemplateDraft = () => {
    const name = templateDraft.name.trim();
    if (!name) {
      setError("Название шаблона обязательно.");
      return;
    }
    setTemplates((current) => {
      const exists = current.some((item) => item.clientId === templateDraft.clientId);
      const nextTemplate = { ...templateDraft, name, breaks: normalizeBreaks(templateDraft.breaks) };
      if (exists) {
        return current.map((item) => (item.clientId === templateDraft.clientId ? nextTemplate : item));
      }
      return [...current, nextTemplate];
    });
    resetTemplateDraft();
  };

  const deleteTemplateDraft = (templateId: string) => {
    setTemplates((current) => current.filter((item) => item.clientId !== templateId));
    setWeeklyDays((current) =>
      current.map((day) => (day.templateId === templateId ? { ...day, templateId: null, isActive: false } : day))
    );
    setOverridesByMonth((current) => {
      const next: Record<string, ScheduleOverride[]> = {};
      for (const key of Object.keys(current)) {
        next[key] = current[key].map((item) => {
          if (item.type === "TEMPLATE" && item.templateId === templateId) {
            return { date: item.date, type: "OFF" };
          }
          return item;
        });
      }
      return next;
    });
  };

  const makeOffday = () => {
    updateOverride(selectedDate, { date: selectedDate, type: "OFF" });
  };

  const makeWorkdayFromPlan = () => {
    if (selectedBasePlan.isWorking) {
      removeOverride(selectedDate);
      return;
    }
    const weekday = toWeekday(selectedDate);
    const weekly = weeklyByDay.get(weekday);
    if (weekly?.templateId) {
      updateOverride(selectedDate, {
        date: selectedDate,
        type: "TEMPLATE",
        templateId: weekly.templateId,
        isActive: true,
      });
      return;
    }
    if (templates.length > 0) {
      updateOverride(selectedDate, {
        date: selectedDate,
        type: "TEMPLATE",
        templateId: templates[0].clientId,
        isActive: true,
      });
      return;
    }
    updateOverride(selectedDate, {
      date: selectedDate,
      type: "TIME_RANGE",
      startLocal: rangeStart,
      endLocal: rangeEnd,
      breaks: rangeBreaks,
    });
  };

  const applyTimeRange = () => {
    updateOverride(selectedDate, {
      date: selectedDate,
      type: "TIME_RANGE",
      startLocal: rangeStart,
      endLocal: rangeEnd,
      breaks: rangeBreaks,
    });
  };

  const resetOverride = () => {
    removeOverride(selectedDate);
  };

  const buildPayload = (): SchedulePayload => {
    return {
      templates: templates.map((template) => ({
        clientId: template.clientId,
        id: template.id,
        name: template.name,
        startLocal: template.startLocal,
        endLocal: template.endLocal,
        breaks: template.breaks ?? [],
        color: template.color ?? null,
      })),
      weekly: { days: weeklyDays },
      overrides: Object.values(overridesByMonth).flatMap((items) => items),
    };
  };

  const saveSolo = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const removedTemplateIds = initialTemplates
        .filter((item) => !templates.some((next) => next.clientId === item.clientId))
        .map((item) => item.clientId);

      const sanitizedWeekly = weeklyDays.map((day) => {
        if (day.templateId && removedTemplateIds.includes(day.templateId)) {
          return { ...day, templateId: null, isActive: false };
        }
        return day;
      });

      const sanitizedOverridesByMonth: Record<string, ScheduleOverride[]> = {};
      for (const key of Object.keys(overridesByMonth)) {
        sanitizedOverridesByMonth[key] = (overridesByMonth[key] ?? []).map((item) => {
          if (item.type === "TEMPLATE" && item.templateId && removedTemplateIds.includes(item.templateId)) {
            return { date: item.date, type: "OFF" };
          }
          return item;
        });
      }

      const templateIdMap = new Map<string, string>();

      for (const template of templates) {
        if (template.id) {
          templateIdMap.set(template.clientId, template.id);
        }
      }

      for (const template of templates) {
        if (template.id) continue;
        const res = await fetch("/api/provider/schedule/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: template.name,
            startLocal: template.startLocal,
            endLocal: template.endLocal,
            breaks: template.breaks ?? [],
            color: template.color ?? null,
          }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        templateIdMap.set(template.clientId, json.data.id);
      }

      for (const template of templates) {
        if (!template.id) continue;
        const initial = initialTemplates.find((item) => item.clientId === template.clientId);
        if (
          initial &&
          initial.name === template.name &&
          initial.startLocal === template.startLocal &&
          initial.endLocal === template.endLocal &&
          JSON.stringify(initial.breaks ?? []) === JSON.stringify(template.breaks ?? [])
        ) {
          continue;
        }
        const res = await fetch(`/api/provider/schedule/templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: template.name,
            startLocal: template.startLocal,
            endLocal: template.endLocal,
            breaks: template.breaks ?? [],
            color: template.color ?? null,
          }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
      }

      for (const template of initialTemplates) {
        if (!templates.some((item) => item.clientId === template.clientId)) {
          if (!template.id) continue;
          const res = await fetch(`/api/provider/schedule/templates/${template.id}`, { method: "DELETE" });
          const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
          if (!res.ok || !json || !json.ok) {
            throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
          }
        }
      }

      const weeklyPayload = sanitizedWeekly.map((day) => ({
        ...day,
        templateId: day.templateId ? templateIdMap.get(day.templateId) ?? null : null,
      }));

      const weeklyRes = await fetch("/api/provider/schedule/weekly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: weeklyPayload }),
      });
      const weeklyJson = (await weeklyRes.json().catch(() => null)) as ApiResponse<{ days: WeeklyDay[] }> | null;
      if (!weeklyRes.ok || !weeklyJson || !weeklyJson.ok) {
        throw new Error(weeklyJson && !weeklyJson.ok ? weeklyJson.error.message : `API error: ${weeklyRes.status}`);
      }

      for (const key of Object.keys(sanitizedOverridesByMonth)) {
        const draft = sanitizedOverridesByMonth[key] ?? [];
        const initial = initialOverridesByMonth[key] ?? [];
        const initialDates = new Set(initial.map((item) => item.date));

        for (const item of draft) {
          const mappedOverride: ScheduleOverride =
            item.type === "TEMPLATE"
              ? {
                  ...item,
                  templateId: item.templateId ? templateIdMap.get(item.templateId) ?? null : null,
                }
              : item;
          const res = await fetch(`/api/provider/schedule/overrides/${item.date}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mappedOverride),
          });
          const json = (await res.json().catch(() => null)) as ApiResponse<{ date: string }> | null;
          if (!res.ok || !json || !json.ok) {
            throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
          }
          initialDates.delete(item.date);
        }

        for (const dateKey of initialDates) {
          const res = await fetch(`/api/provider/schedule/overrides/${dateKey}`, { method: "DELETE" });
          const json = (await res.json().catch(() => null)) as ApiResponse<{ date: string }> | null;
          if (!res.ok || !json || !json.ok) {
            throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
          }
        }
      }

      const nextTemplates = templates.map((item) => {
        if (item.id) return item;
        const mappedId = templateIdMap.get(item.clientId);
        if (!mappedId) return item;
        return { ...item, id: mappedId };
      });
      setTemplates(nextTemplates);
      setWeeklyDays(weeklyPayload);
      setOverridesByMonth(sanitizedOverridesByMonth);
      setInitialTemplates(nextTemplates);
      setInitialWeeklyDays(weeklyPayload);
      setInitialOverridesByMonth(sanitizedOverridesByMonth);
      setInfo("График сохранен.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить график");
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/provider/schedule/submit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
      setInfo("Запрос отправлен на согласование.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить запрос");
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setTemplates(initialTemplates);
    setWeeklyDays(initialWeeklyDays);
    setOverridesByMonth(initialOverridesByMonth);
    setInfo("Изменения сброшены.");
  };

  const calendarDays = useMemo(() => buildMonthGrid(month), [month]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загружаем график...</div>;
  }

  return (
    <section className="space-y-4">
      {status.mode === "studio_member" ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm">
          {status.requestStatus === "PENDING" ? (
            <div className="text-text-main">
              Ваш новый график на проверке у администратора. Редактирование временно недоступно.
            </div>
          ) : status.requestStatus === "REJECTED" ? (
            <div className="text-text-main">
              Запрос отклонен.
              {status.rejectedComment ? (
                <div className="mt-1 text-xs text-text-sec">Комментарий: {status.rejectedComment}</div>
              ) : null}
            </div>
          ) : (
            <div className="text-text-sec">Изменения по графику отправляются на согласование.</div>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">{info}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="text-base font-semibold">Настройки</div>
            <div className="text-xs text-text-sec">Шаблоны, неделя и исключения.</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              items={[
                { id: "templates", label: "Шаблоны", badge: templates.length },
                { id: "week", label: "Неделя" },
                { id: "overrides", label: "Исключения" },
              ]}
              value={tab}
              onChange={(value) => setTab(value as "templates" | "week" | "overrides")}
            />

            {tab === "templates" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.clientId}
                      className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text-main">{template.name}</div>
                          <div className="mt-1 text-xs text-text-sec">
                            {template.startLocal}–{template.endLocal}
                          </div>
                          {template.breaks.length > 0 ? (
                            <div className="mt-1 text-[11px] text-text-sec">
                              Перерывы:{" "}
                              {template.breaks.map((item) => `${item.startLocal}–${item.endLocal}`).join(", ")}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startEditTemplate(template)}
                            disabled={readOnly}
                          >
                            Редактировать
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => deleteTemplateDraft(template.clientId)}
                            disabled={readOnly}
                          >
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border-subtle bg-bg-card p-3">
                  <div className="mb-2 text-sm font-semibold">
                    {editingTemplateId ? "Редактирование шаблона" : "Новый шаблон"}
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={templateDraft.name}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Название шаблона"
                      disabled={readOnly}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        type="time"
                        value={templateDraft.startLocal}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, startLocal: event.target.value }))
                        }
                        disabled={readOnly}
                      />
                      <Input
                        type="time"
                        value={templateDraft.endLocal}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, endLocal: event.target.value }))
                        }
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-text-sec">
                        <span>Перерывы (до 3)</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTemplateDraft((current) =>
                              current.breaks.length >= 3
                                ? current
                                : {
                                    ...current,
                                    breaks: [...current.breaks, { startLocal: "13:00", endLocal: "14:00" }],
                                  }
                            )
                          }
                          disabled={readOnly}
                          className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-main"
                        >
                          + Перерыв
                        </button>
                      </div>
                      {templateDraft.breaks.map((item, index) => (
                        <div key={`draft-break-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Input
                            type="time"
                            value={item.startLocal}
                            onChange={(event) =>
                              setTemplateDraft((current) => ({
                                ...current,
                                breaks: current.breaks.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, startLocal: event.target.value } : entry
                                ),
                              }))
                            }
                            disabled={readOnly}
                          />
                          <Input
                            type="time"
                            value={item.endLocal}
                            onChange={(event) =>
                              setTemplateDraft((current) => ({
                                ...current,
                                breaks: current.breaks.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, endLocal: event.target.value } : entry
                                ),
                              }))
                            }
                            disabled={readOnly}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setTemplateDraft((current) => ({
                                ...current,
                                breaks: current.breaks.filter((_, entryIndex) => entryIndex !== index),
                              }))
                            }
                            disabled={readOnly}
                            className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-red-600"
                          >
                            удалить
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={upsertTemplateDraft}
                        disabled={readOnly || templates.length >= 7}
                      >
                        {editingTemplateId ? "Сохранить" : "Добавить шаблон"}
                      </Button>
                      {editingTemplateId ? (
                        <Button variant="secondary" size="sm" onClick={resetTemplateDraft} disabled={readOnly}>
                          Отмена
                        </Button>
                      ) : null}
                      {templates.length >= 7 ? <div className="text-xs text-text-sec">Достигнут лимит 7 шаблонов.</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "week" ? (
              <div className="space-y-2">
                {WEEKDAYS.map((label, index) => {
                  const weekday = index + 1;
                  const day = weeklyByDay.get(weekday) ?? {
                    weekday,
                    templateId: null,
                    isActive: false,
                  };
                  return (
                    <div
                      key={label}
                      className="grid items-center gap-2 rounded-2xl border border-border-subtle bg-bg-input/60 p-2 sm:grid-cols-[32px_minmax(0,1fr)_140px]"
                    >
                      <div className="text-sm font-semibold text-text-main">{label}</div>
                      <Select
                        value={day.templateId ?? ""}
                        onChange={(event) => updateWeeklyDay(weekday, { templateId: event.target.value || null })}
                        disabled={readOnly}
                        className="rounded-xl px-2 py-1 text-sm"
                      >
                        <option value="">Нет шаблона</option>
                        {templates.map((template) => (
                          <option key={template.clientId} value={template.clientId}>
                            {template.name}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-2 text-xs text-text-sec">
                        <input
                          type="checkbox"
                          checked={day.isActive && Boolean(day.templateId)}
                          onChange={(event) => updateWeeklyDay(weekday, { isActive: event.target.checked })}
                          disabled={readOnly || !day.templateId}
                        />
                        Рабочий день
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {tab === "overrides" ? (
              <div className="space-y-2">
                {overrides.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-subtle p-3 text-sm text-text-sec">
                    Исключений пока нет.
                  </div>
                ) : (
                  overrides.map((item) => (
                    <div
                      key={item.date}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-border-subtle bg-bg-input/60 p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium text-text-main">{item.date}</div>
                        <div className="text-xs text-text-sec">
                          {item.type === "OFF"
                            ? "Выходной"
                            : item.type === "TIME_RANGE"
                              ? `Кастом ${item.startLocal ?? ""}–${item.endLocal ?? ""}`
                              : "Шаблон по дате"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeOverride(item.date)} disabled={readOnly}>
                        Удалить
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Календарь</div>
                <div className="text-xs text-text-sec">План по неделе и исключения.</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm"
                  onClick={() => setMonth((prev) => monthShift(prev, -1))}
                >
                  ◀
                </button>
                <div className="min-w-[140px] text-center text-sm font-medium text-text-main">{monthTitle(month)}</div>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm"
                  onClick={() => setMonth((prev) => monthShift(prev, 1))}
                >
                  ▶
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 text-xs text-text-sec">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center">
                  {day}
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-2xl bg-border-subtle/35 p-2">
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map(({ dateKey, inMonth }) => {
                  const override = overridesByDate.get(dateKey);
                  const weekday = toWeekday(dateKey);
                  const weekly = weeklyByDay.get(weekday);
                  const template = weekly?.templateId ? templatesById.get(weekly.templateId) : null;
                  const plannedWorking = Boolean(weekly?.isActive && template);
                  const plannedLabel = plannedWorking
                    ? `${template?.name ?? "Смена"} ${template?.startLocal ?? ""}–${template?.endLocal ?? ""}`
                    : "Выходной";

                  let actualLabel = plannedLabel;
                  let actualWorking = plannedWorking;
                  if (override?.type === "OFF") {
                    actualWorking = false;
                    actualLabel = "Выходной";
                  } else if (override?.type === "TIME_RANGE") {
                    actualWorking = true;
                    actualLabel = `Кастом ${override.startLocal ?? ""}–${override.endLocal ?? ""}`;
                  } else if (override?.type === "TEMPLATE") {
                    if (!override.isActive || !override.templateId) {
                      actualWorking = false;
                      actualLabel = "Выходной";
                    } else {
                      const overrideTemplate = templatesById.get(override.templateId);
                      actualWorking = Boolean(overrideTemplate);
                      actualLabel = overrideTemplate
                        ? `${overrideTemplate.name} ${overrideTemplate.startLocal}–${overrideTemplate.endLocal}`
                        : "Шаблон";
                    }
                  }

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      className={`min-h-[96px] rounded-2xl border border-border-subtle/70 p-2 text-left text-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card ${
                        inMonth ? "bg-bg-card" : "bg-bg-input text-text-sec"
                      } ${selectedDate === dateKey ? "border-primary/60 ring-1 ring-primary/35" : ""}`}
                    >
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span>{dateKey.slice(8, 10)}</span>
                        {override ? <span className="text-[10px] text-primary">✦</span> : null}
                      </div>
                      <div className={`mt-2 text-[10px] ${actualWorking ? "text-emerald-700/80" : "text-rose-700/80"}`}>
                        {actualLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="text-base font-semibold">Действия с днем</div>
            <div className="text-xs text-text-sec">{selectedDate}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3 text-sm">
              <div className="text-xs text-text-sec">По плану:</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {formatPlanLabel({
                  isWorking: selectedBasePlan.isWorking,
                  startLocal: selectedBasePlan.startLocal,
                  endLocal: selectedBasePlan.endLocal,
                  templateName: selectedBasePlan.templateName,
                  kind: "weekly",
                })}
              </div>
              {selectedOverride ? <div className="mt-2 text-xs text-text-sec">Исключение: {formatPlanLabel(selectedResolved)}</div> : null}
            </div>

            <div className="grid gap-2">
              <Button variant="secondary" onClick={makeOffday} disabled={readOnly}>
                Сделать выходным
              </Button>
              <Button variant="secondary" onClick={makeWorkdayFromPlan} disabled={readOnly}>
                Сделать рабочим
              </Button>
              <Button variant="secondary" onClick={resetOverride} disabled={readOnly || !selectedOverride}>
                Сбросить к шаблону
              </Button>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
              <div className="text-sm font-semibold text-text-main">Изменить время</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input type="time" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} disabled={readOnly} />
                <Input type="time" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} disabled={readOnly} />
              </div>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-sec">
                  <span>Перерывы</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRangeBreaks((current) =>
                        current.length >= 3 ? current : [...current, { startLocal: "13:00", endLocal: "14:00" }]
                      )
                    }
                    disabled={readOnly}
                    className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-main"
                  >
                    + Перерыв
                  </button>
                </div>
                {rangeBreaks.map((item, index) => (
                  <div key={`range-break-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      type="time"
                      value={item.startLocal}
                      onChange={(event) =>
                        setRangeBreaks((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, startLocal: event.target.value } : entry
                          )
                        )
                      }
                      disabled={readOnly}
                    />
                    <Input
                      type="time"
                      value={item.endLocal}
                      onChange={(event) =>
                        setRangeBreaks((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, endLocal: event.target.value } : entry
                          )
                        )
                      }
                      disabled={readOnly}
                    />
                    <button
                      type="button"
                      onClick={() => setRangeBreaks((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                      disabled={readOnly}
                      className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-red-600"
                    >
                      удалить
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={applyTimeRange} disabled={readOnly}>
                  Применить время
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRangeFromTemplate(selectedOverride?.templateId ?? selectedWeeklyTemplateId)}
                  disabled={readOnly}
                >
                  Подставить из шаблона
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card/90 p-4 shadow-card backdrop-blur">
          <div className="text-sm text-text-sec">
            {status.mode === "studio_member"
              ? "Изменения отправляются на согласование администратора студии."
              : "Сохраните изменения, чтобы обновить график."}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetChanges} disabled={saving || readOnly}>
              Сбросить изменения
            </Button>
            {status.mode === "studio_member" ? (
              <Button onClick={() => void submitRequest()} disabled={saving || readOnly}>
                {saving ? "Отправляем..." : "Отправить на согласование"}
              </Button>
            ) : (
              <Button onClick={() => void saveSolo()} disabled={saving || readOnly}>
                {saving ? "Сохраняем..." : "Сохранить график"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
