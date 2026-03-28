"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";

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
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotTimes: string[];
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
  scheduleMode?: "FLEXIBLE" | "FIXED";
  fixedSlotTimes?: string[];
  removedOverrides?: string[];
};

const SCHEDULE_TEXT = UI_TEXT.cabinet.master.schedule;
const WEEKDAYS = SCHEDULE_TEXT.dayShortNames;

const EMPTY_OVERRIDES: ScheduleOverride[] = [];

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthTitle(monthKey: string, timeZone: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone });
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
  if (!input.isWorking) return SCHEDULE_TEXT.dayOff;
  if (input.templateName) {
    return `${input.templateName} (${input.startLocal ?? "—"}–${input.endLocal ?? "—"})`;
  }
  if (input.startLocal && input.endLocal) {
    return `${SCHEDULE_TEXT.shiftPrefix} ${input.startLocal}–${input.endLocal}`;
  }
  return SCHEDULE_TEXT.workday;
}

function createClientId(): string {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBreaks(input: ScheduleBreak[]): ScheduleBreak[] {
  return input
    .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal }))
    .filter((item) => item.startLocal && item.endLocal);
}

function normalizeFixedSlotTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFixedSlotTimes(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeFixedSlotTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

export function ScheduleBuilder() {
  const viewerTimeZone = useViewerTimeZoneContext();
  const t = UI_TEXT.cabinet.master.schedule;
  const b = t.builder;
  const [status, setStatus] = useState<StatusPayload>({
    mode: "solo",
    scheduleMode: "FLEXIBLE",
    fixedSlotTimes: [],
  });
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
  const [scheduleMode, setScheduleMode] = useState<"FLEXIBLE" | "FIXED">("FLEXIBLE");
  const [initialScheduleMode, setInitialScheduleMode] = useState<"FLEXIBLE" | "FIXED">("FLEXIBLE");
  const [fixedSlotTimes, setFixedSlotTimes] = useState<string[]>([]);
  const [initialFixedSlotTimes, setInitialFixedSlotTimes] = useState<string[]>([]);
  const [newFixedSlotTime, setNewFixedSlotTime] = useState("10:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [templateDraft, setTemplateDraft] = useState<ScheduleTemplate>({
    clientId: createClientId(),
    name: "",
    startLocal: "",
    endLocal: "",
    breaks: [],
    color: null,
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
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
        templateName: t.customLabel,
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
        templateName: template?.name ?? t.templateLabelShort,
        kind: "override" as const,
      };
    }
    return { ...selectedBasePlan, kind: "weekly" as const };
  }, [selectedBasePlan, selectedOverride, templatesById, t.customLabel, t.templateLabelShort]);

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
      const mode = statusJson.data.scheduleMode === "FIXED" ? "FIXED" : "FLEXIBLE";
      const fixedTimes = normalizeFixedSlotTimes(statusJson.data.fixedSlotTimes ?? []);

      setStatus(statusJson.data);
      setTemplates(templateItems);
      setWeeklyDays(weeklyItems);
      setInitialTemplates(templateItems);
      setInitialWeeklyDays(weeklyItems);
      setScheduleMode(mode);
      setInitialScheduleMode(mode);
      setFixedSlotTimes(fixedTimes);
      setInitialFixedSlotTimes(fixedTimes);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.load);
    } finally {
      setLoading(false);
    }
  }, [t.errors.load]);

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
        setError(err instanceof Error ? err.message : t.errors.loadOverrides);
      }
    },
    [overridesByMonth, t.errors.loadOverrides]
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
      setRangeStart(selectedOverride.startLocal ?? "");
      setRangeEnd(selectedOverride.endLocal ?? "");
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
        const isTemplateUpdate = next.templateId !== undefined;
        const templateId = next.templateId !== undefined ? next.templateId : day.templateId;
        let isActive = next.isActive !== undefined ? next.isActive : day.isActive;
        if (isTemplateUpdate) {
          isActive = Boolean(templateId);
        }
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

  const addFixedSlotTime = () => {
    const normalized = normalizeFixedSlotTime(newFixedSlotTime);
    if (!normalized) {
      setError(t.errors.invalidSlotTime);
      return;
    }
    setError(null);
    setFixedSlotTimes((current) => normalizeFixedSlotTimes([...current, normalized]));
  };

  const removeFixedSlotTime = (value: string) => {
    setFixedSlotTimes((current) => current.filter((item) => item !== value));
  };

  const resetTemplateDraft = () => {
    setTemplateDraft({
      clientId: createClientId(),
      name: "",
      startLocal: "",
      endLocal: "",
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
      setError(t.errors.templateNameRequired);
      return;
    }
    if (!templateDraft.startLocal || !templateDraft.endLocal) {
      setError(t.errors.timeRangeRequired);
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
    if (!rangeStart || !rangeEnd) {
      setError(t.errors.timeRangeRequired);
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
    if (!rangeStart || !rangeEnd) {
      setError(t.errors.timeRangeRequired);
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
      scheduleMode,
      fixedSlotTimes,
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

      const settingsRes = await fetch("/api/provider/schedule/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleMode,
          fixedSlotTimes,
        }),
      });
      const settingsJson = (await settingsRes.json().catch(() => null)) as
        | ApiResponse<{ scheduleMode: "FLEXIBLE" | "FIXED"; fixedSlotTimes: string[] }>
        | null;
      if (!settingsRes.ok || !settingsJson || !settingsJson.ok) {
        throw new Error(settingsJson && !settingsJson.ok ? settingsJson.error.message : `API error: ${settingsRes.status}`);
      }
      const savedMode = settingsJson.data.scheduleMode;
      const savedFixedSlots = normalizeFixedSlotTimes(settingsJson.data.fixedSlotTimes ?? []);

      const nextTemplates = templates.map((item) => {
        if (item.id) return item;
        const mappedId = templateIdMap.get(item.clientId);
        if (!mappedId) return item;
        return { ...item, id: mappedId };
      });
      setStatus((current) => ({ ...current, scheduleMode: savedMode, fixedSlotTimes: savedFixedSlots }));
      setScheduleMode(savedMode);
      setFixedSlotTimes(savedFixedSlots);
      setTemplates(nextTemplates);
      setWeeklyDays(weeklyPayload);
      setOverridesByMonth(sanitizedOverridesByMonth);
      setInitialScheduleMode(savedMode);
      setInitialFixedSlotTimes(savedFixedSlots);
      setInitialTemplates(nextTemplates);
      setInitialWeeklyDays(weeklyPayload);
      setInitialOverridesByMonth(sanitizedOverridesByMonth);
      setInfo(t.info.savedWeek);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.saveWeek);
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
      setInfo(t.info.requestSubmitted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.submitRequest);
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setTemplates(initialTemplates);
    setWeeklyDays(initialWeeklyDays);
    setOverridesByMonth(initialOverridesByMonth);
    setScheduleMode(initialScheduleMode);
    setFixedSlotTimes(initialFixedSlotTimes);
    setInfo(t.info.resetDone);
  };

  const calendarDays = useMemo(() => buildMonthGrid(month), [month]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{b.loading}</div>;
  }

  return (
    <section className="space-y-4">
      {status.mode === "studio_member" ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm">
          {status.requestStatus === "PENDING" ? (
            <div className="text-text-main">{b.pendingReadonly}</div>
          ) : status.requestStatus === "REJECTED" ? (
            <div className="text-text-main">
              {b.requestRejected}
              {status.rejectedComment ? (
                <div className="mt-1 text-xs text-text-sec">
                  {b.commentLabel}: {status.rejectedComment}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-text-sec">{b.submitHintStudio}</div>
          )}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div>
      ) : null}
      {info ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">{info}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="text-base font-semibold">{b.settingsTitle}</div>
            <div className="text-xs text-text-sec">{b.settingsSubtitle}</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
              <div className="text-sm font-semibold text-text-main">{UI_TEXT.schedule.mode.label}</div>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-xs text-text-sec">
                  <input
                    type="radio"
                    name="schedule-mode"
                    checked={scheduleMode === "FLEXIBLE"}
                    onChange={() => setScheduleMode("FLEXIBLE")}
                    disabled={readOnly}
                  />
                  <span>{UI_TEXT.schedule.mode.flexible}</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-text-sec">
                  <input
                    type="radio"
                    name="schedule-mode"
                    checked={scheduleMode === "FIXED"}
                    onChange={() => setScheduleMode("FIXED")}
                    disabled={readOnly}
                  />
                  <span>{UI_TEXT.schedule.mode.fixed}</span>
                </label>
              </div>
            </div>

            {scheduleMode === "FIXED" ? (
              <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
                <div className="text-sm font-semibold text-text-main">{UI_TEXT.schedule.fixedSlots.title}</div>
                <p className="mt-1 text-xs text-text-sec">{UI_TEXT.schedule.fixedSlots.hint}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="time"
                    value={newFixedSlotTime}
                    onChange={(event) => setNewFixedSlotTime(event.target.value)}
                    disabled={readOnly}
                    className="max-w-[120px]"
                  />
                  <Button variant="secondary" size="sm" onClick={addFixedSlotTime} disabled={readOnly}>
                    {UI_TEXT.schedule.fixedSlots.add}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {fixedSlotTimes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-subtle px-3 py-2 text-xs text-text-sec">
                      {UI_TEXT.schedule.fixedSlots.hint}
                    </div>
                  ) : (
                    fixedSlotTimes.map((slotTime) => (
                      <div
                        key={slotTime}
                        className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-card px-3 py-2"
                      >
                        <span className="text-sm font-medium text-text-main">{slotTime}</span>
                        <Button
                          variant="ghost"
                          size="none"
                          type="button"
                          onClick={() => removeFixedSlotTime(slotTime)}
                          aria-label={b.deleteWindowAria}
                          disabled={readOnly}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-text-sec transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <Tabs
              items={[
                { id: "templates", label: b.tabs.templates, badge: templates.length },
                { id: "week", label: b.tabs.week },
                { id: "overrides", label: b.tabs.overrides },
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
                              {b.breaksPrefix}:{" "}
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
                            {b.editTemplate}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => deleteTemplateDraft(template.clientId)}
                            disabled={readOnly}
                          >
                            {UI_TEXT.actions.delete}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border-subtle bg-bg-card p-3">
                  <div className="mb-2 text-sm font-semibold">
                    {editingTemplateId ? b.editTemplateTitle : b.createTemplateTitle}
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={templateDraft.name}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder={b.templateNamePlaceholder}
                      disabled={readOnly}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        type="time"
                        placeholder="09:00"
                        value={templateDraft.startLocal}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, startLocal: event.target.value }))
                        }
                        disabled={readOnly}
                      />
                      <Input
                        type="time"
                        placeholder="09:00"
                        value={templateDraft.endLocal}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({ ...current, endLocal: event.target.value }))
                        }
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-text-sec">
                        <span>{b.breaksLimit}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() =>
                            setTemplateDraft((current) =>
                              current.breaks.length >= 3
                                ? current
                                : {
                                    ...current,
                                    breaks: [...current.breaks, { startLocal: "", endLocal: "" }],
                                  }
                            )
                          }
                          disabled={readOnly}
                          className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-main"
                        >
                          {b.addBreak}
                        </Button>
                      </div>
                      {templateDraft.breaks.map((item, index) => (
                        <div key={`draft-break-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Input
                            type="time"
                            placeholder="09:00"
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
                            placeholder="09:00"
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
                          <Button
                            variant="ghost"
                            size="none"
                            type="button"
                            onClick={() =>
                              setTemplateDraft((current) => ({
                                ...current,
                                breaks: current.breaks.filter((_, entryIndex) => entryIndex !== index),
                              }))
                            }
                            disabled={readOnly}
                            aria-label={b.deleteBreakAria}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-text-sec transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
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
                        {editingTemplateId ? UI_TEXT.actions.save : b.addTemplate}
                      </Button>
                      {editingTemplateId ? (
                        <Button variant="secondary" size="sm" onClick={resetTemplateDraft} disabled={readOnly}>
                          {UI_TEXT.actions.cancel}
                        </Button>
                      ) : null}
                      {templates.length >= 7 ? <div className="text-xs text-text-sec">{b.templateLimitReached}</div> : null}
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
                  const selectedTemplate = day.templateId ? templatesById.get(day.templateId) ?? null : null;
                  return (
                    <div
                      key={label}
                      className="grid items-center gap-2 rounded-2xl border border-border-subtle bg-bg-input/60 p-2 sm:grid-cols-[32px_minmax(0,1fr)_auto]"
                    >
                      <div className="text-sm font-semibold text-text-main">{label}</div>
                      <div className="space-y-1">
                      <Select
                        value={day.templateId ?? ""}
                        onChange={(event) => updateWeeklyDay(weekday, { templateId: event.target.value || null })}
                        disabled={readOnly}
                        className="rounded-xl px-2 py-1 text-sm"
                      >
                        <option value="">{b.noTemplateOption}</option>
                        {templates.map((template) => (
                          <option key={template.clientId} value={template.clientId}>
                            {template.name}
                          </option>
                        ))}
                      </Select>
                        {selectedTemplate ? (
                          <span className="text-sm font-medium text-text-main">{selectedTemplate.name}</span>
                        ) : null}
                      </div>
                      <label className="flex items-center justify-end">
                        <input
                          type="checkbox"
                          checked={day.isActive && Boolean(day.templateId)}
                          onChange={(event) => updateWeeklyDay(weekday, { isActive: event.target.checked })}
                          disabled={readOnly || !day.templateId}
                        />
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
                    {b.noOverrides}
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
                            ? t.dayOff
                            : item.type === "TIME_RANGE"
                              ? `${t.customLabel} ${item.startLocal ?? ""}–${item.endLocal ?? ""}`
                              : t.byDateTemplateLabel}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="none"
                        type="button"
                        onClick={() => removeOverride(item.date)}
                        aria-label={b.deleteOverrideAria}
                        disabled={readOnly}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-text-sec transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
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
                <div className="text-base font-semibold">{b.calendarTitle}</div>
                <div className="text-xs text-text-sec">{b.calendarSubtitle}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="secondary"
                  size="none"
                  type="button"
                  className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm"
                  onClick={() => setMonth((prev) => monthShift(prev, -1))}
                >
                  ◀
                </Button>
                <div className="min-w-[140px] text-center text-sm font-medium text-text-main">
                  {monthTitle(month, viewerTimeZone)}
                </div>
                <Button
                  variant="secondary"
                  size="none"
                  type="button"
                  className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm"
                  onClick={() => setMonth((prev) => monthShift(prev, 1))}
                >
                  ▶
                </Button>
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
                    ? `${template?.name ?? t.shiftPrefix} ${template?.startLocal ?? ""}–${template?.endLocal ?? ""}`
                    : t.dayOff;

                  let actualLabel = plannedLabel;
                  let actualWorking = plannedWorking;
                  if (override?.type === "OFF") {
                    actualWorking = false;
                    actualLabel = t.dayOff;
                  } else if (override?.type === "TIME_RANGE") {
                    actualWorking = true;
                    actualLabel = `${t.customLabel} ${override.startLocal ?? ""}–${override.endLocal ?? ""}`;
                  } else if (override?.type === "TEMPLATE") {
                    if (!override.isActive || !override.templateId) {
                      actualWorking = false;
                      actualLabel = t.dayOff;
                    } else {
                      const overrideTemplate = templatesById.get(override.templateId);
                      actualWorking = Boolean(overrideTemplate);
                      actualLabel = overrideTemplate
                        ? `${overrideTemplate.name} ${overrideTemplate.startLocal}–${overrideTemplate.endLocal}`
                        : t.templateLabelShort;
                    }
                  }

                  return (
                    <Button
                      variant="wrapper"
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
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="text-base font-semibold">{b.dayActionsTitle}</div>
            <div className="text-xs text-text-sec">{selectedDate}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3 text-sm">
              <div className="text-xs text-text-sec">{b.basedOnPlan}</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {formatPlanLabel({
                  isWorking: selectedBasePlan.isWorking,
                  startLocal: selectedBasePlan.startLocal,
                  endLocal: selectedBasePlan.endLocal,
                  templateName: selectedBasePlan.templateName,
                  kind: "weekly",
                })}
              </div>
              {selectedOverride ? (
                <div className="mt-2 text-xs text-text-sec">
                  {b.overrideLabel}: {formatPlanLabel(selectedResolved)}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Button variant="secondary" onClick={makeOffday} disabled={readOnly}>
                {t.makeHoliday}
              </Button>
              <Button variant="secondary" onClick={makeWorkdayFromPlan} disabled={readOnly}>
                {t.makeWorkday}
              </Button>
              <Button variant="secondary" onClick={resetOverride} disabled={readOnly || !selectedOverride}>
                {t.resetToBase}
              </Button>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
              <div className="text-sm font-semibold text-text-main">{b.editTimeTitle}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  type="time"
                  placeholder="09:00"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  disabled={readOnly}
                />
                <Input
                  type="time"
                  placeholder="09:00"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-sec">
                  <span>{b.breaksTitle}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() =>
                      setRangeBreaks((current) =>
                        current.length >= 3 ? current : [...current, { startLocal: "", endLocal: "" }]
                      )
                    }
                    disabled={readOnly}
                    className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-main"
                  >
                    {b.addBreak}
                  </Button>
                </div>
                {rangeBreaks.map((item, index) => (
                  <div key={`range-break-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      type="time"
                      placeholder="09:00"
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
                      placeholder="09:00"
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
                    <Button
                      variant="ghost"
                      size="none"
                      type="button"
                      onClick={() => setRangeBreaks((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                      disabled={readOnly}
                      aria-label={b.deleteBreakAria}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-text-sec transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={applyTimeRange} disabled={readOnly}>
                  {UI_TEXT.actions.save}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRangeFromTemplate(selectedOverride?.templateId ?? selectedWeeklyTemplateId)}
                  disabled={readOnly}
                >
                  {b.applyFromTemplate}
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
              ? b.submitHintStudio
              : b.submitHintSolo}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetChanges} disabled={saving || readOnly}>
              {b.resetChanges}
            </Button>
            {status.mode === "studio_member" ? (
              <Button onClick={() => void submitRequest()} disabled={saving || readOnly}>
                {saving ? b.sending : b.submitForApproval}
              </Button>
            ) : (
              <Button onClick={() => void saveSolo()} disabled={saving || readOnly}>
                {saving ? UI_TEXT.status.saving : b.saveSchedule}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
