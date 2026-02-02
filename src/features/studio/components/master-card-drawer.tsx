"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterServiceItem = {
  serviceId: string;
  serviceTitle: string;
  isEnabled: boolean;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  commissionPct: number | null;
};

type MasterDetails = {
  id: string;
  name: string;
  isActive: boolean;
  tagline: string;
  services: MasterServiceItem[];
};

type MasterScheduleData = {
  templates: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  }>;
  dayRules: Array<{
    id: string;
    weekday: number;
    templateId: string;
    isWorking: boolean;
  }>;
  exceptions: Array<{
    id: string;
    date: string;
    type: "OFF" | "SHIFT";
    startTime: string | null;
    endTime: string | null;
  }>;
  blocks: Array<{
    id: string;
    startAt: string;
    endAt: string;
    type: "BREAK" | "BLOCK";
    note: string | null;
  }>;
};

type Props = {
  studioId: string;
  masterId: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function MasterCardDrawer({ studioId, masterId, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<"skills" | "schedule" | "portfolio">("skills");
  const [details, setDetails] = useState<MasterDetails | null>(null);
  const [schedule, setSchedule] = useState<MasterScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, MasterServiceItem>>({});
  const [search, setSearch] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileTagline, setProfileTagline] = useState("");
  const [profileActive, setProfileActive] = useState(true);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionType, setExceptionType] = useState<"OFF" | "SHIFT">("OFF");
  const [exceptionStart, setExceptionStart] = useState("10:00");
  const [exceptionEnd, setExceptionEnd] = useState("19:00");
  const [dayRuleDraft, setDayRuleDraft] = useState<Record<number, { templateId: string; isWorking: boolean }>>({});
  const [newTemplateTitle, setNewTemplateTitle] = useState("Default shift");
  const [newTemplateStart, setNewTemplateStart] = useState("10:00");
  const [newTemplateEnd, setNewTemplateEnd] = useState("19:00");

  const load = async (): Promise<void> => {
    if (!masterId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ studioId });
      const [masterRes, scheduleRes] = await Promise.all([
        fetch(`/api/studio/masters/${masterId}?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/studio/masters/${masterId}/schedule?${query.toString()}`, { cache: "no-store" }),
      ]);

      const masterJson = (await masterRes.json().catch(() => null)) as ApiResponse<MasterDetails> | null;
      if (!masterRes.ok || !masterJson || !masterJson.ok) {
        throw new Error(masterJson && !masterJson.ok ? masterJson.error.message : `API error: ${masterRes.status}`);
      }

      const scheduleJson = (await scheduleRes.json().catch(() => null)) as ApiResponse<MasterScheduleData> | null;
      if (!scheduleRes.ok || !scheduleJson || !scheduleJson.ok) {
        throw new Error(
          scheduleJson && !scheduleJson.ok ? scheduleJson.error.message : `API error: ${scheduleRes.status}`
        );
      }

      setDetails(masterJson.data);
      setSchedule(scheduleJson.data);
      setProfileName(masterJson.data.name);
      setProfileTagline(masterJson.data.tagline);
      setProfileActive(masterJson.data.isActive);
      setEdited(Object.fromEntries(masterJson.data.services.map((item) => [item.serviceId, { ...item }])));
      setDayRuleDraft(
        Object.fromEntries(
          scheduleJson.data.dayRules.map((item) => [
            item.weekday,
            { templateId: item.templateId, isWorking: item.isWorking },
          ])
        ) as Record<number, { templateId: string; isWorking: boolean }>
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load master");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterId, studioId]);

  const items = useMemo(
    () =>
      Object.values(edited).filter((item) =>
        item.serviceTitle.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [edited, search]
  );

  if (!masterId) return null;

  const saveServices = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          items: Object.values(edited).map((item) => ({
            serviceId: item.serviceId,
            isEnabled: item.isEnabled,
            priceOverride: item.priceOverride,
            durationOverrideMin: item.durationOverrideMin,
            commissionPct: item.commissionPct,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          displayName: profileName.trim(),
          tagline: profileTagline.trim(),
          isActive: profileActive,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const addException = async (): Promise<void> => {
    if (!exceptionDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}/schedule/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          date: exceptionDate,
          type: exceptionType,
          ...(exceptionType === "SHIFT" ? { startTime: exceptionStart, endTime: exceptionEnd } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setExceptionDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exception");
    } finally {
      setSaving(false);
    }
  };

  const removeException = async (exceptionId: string): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const query = new URLSearchParams({ studioId });
      const res = await fetch(
        `/api/studio/masters/${masterId}/schedule/exceptions/${exceptionId}?${query.toString()}`,
        {
          method: "DELETE",
        }
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove exception");
    } finally {
      setSaving(false);
    }
  };

  const createTemplate = async (): Promise<void> => {
    if (!newTemplateTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}/schedule/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          title: newTemplateTitle.trim(),
          startTime: newTemplateStart,
          endTime: newTemplateEnd,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  const saveDayRules = async (): Promise<void> => {
    const items = WEEK_DAYS.map((_, weekday) => {
      const current = dayRuleDraft[weekday];
      return current ? { weekday, templateId: current.templateId, isWorking: current.isWorking } : null;
    }).filter((item): item is { weekday: number; templateId: string; isWorking: boolean } => item !== null);
    if (items.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}/schedule/day-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, items }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save day rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{details?.name ?? "Master card"}</div>
            <div className="text-xs text-neutral-500">{details?.tagline ?? ""}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-2 py-1 text-sm">
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          {(["skills", "schedule", "portfolio"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                tab === item ? "border-black bg-black text-white" : "border-neutral-300"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {loading ? <div className="mt-4 text-sm">Loading...</div> : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading && tab === "skills" ? (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search service"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            {items.map((item) => (
              <div key={item.serviceId} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{item.serviceTitle}</div>
                  <label className="text-xs">
                    <input
                      type="checkbox"
                      checked={item.isEnabled}
                      onChange={(event) =>
                        setEdited((current) => ({
                          ...current,
                          [item.serviceId]: { ...current[item.serviceId], isEnabled: event.target.checked },
                        }))
                      }
                    />{" "}
                    Enabled
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input
                    type="number"
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="price override"
                    value={item.priceOverride ?? ""}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [item.serviceId]: {
                          ...current[item.serviceId],
                          priceOverride: event.target.value ? Number(event.target.value) : null,
                        },
                      }))
                    }
                  />
                  <input
                    type="number"
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="duration override"
                    value={item.durationOverrideMin ?? ""}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [item.serviceId]: {
                          ...current[item.serviceId],
                          durationOverrideMin: event.target.value ? Number(event.target.value) : null,
                        },
                      }))
                    }
                  />
                  <input
                    type="number"
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="commission %"
                    value={item.commissionPct ?? ""}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [item.serviceId]: {
                          ...current[item.serviceId],
                          commissionPct: event.target.value ? Number(event.target.value) : null,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void saveServices()}
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save skills"}
            </button>
          </div>
        ) : null}

        {!loading && tab === "schedule" ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border p-3">
              <div className="text-sm font-semibold">Templates</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <input
                  type="text"
                  value={newTemplateTitle}
                  onChange={(event) => setNewTemplateTitle(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
                <input
                  type="text"
                  value={newTemplateStart}
                  onChange={(event) => setNewTemplateStart(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
                <input
                  type="text"
                  value={newTemplateEnd}
                  onChange={(event) => setNewTemplateEnd(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => void createTemplate()} className="rounded border px-2 py-1 text-sm">
                  Add template
                </button>
              </div>
              <div className="mt-2 space-y-1 text-xs text-neutral-600">
                {schedule?.templates.map((template) => (
                  <div key={template.id}>
                    {template.title}: {template.startTime}-{template.endTime}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-semibold">Day rules</div>
              <div className="mt-2 space-y-2 text-xs text-neutral-600">
                {WEEK_DAYS.map((day, index) => {
                  const rule = schedule?.dayRules.find((item) => item.weekday === index);
                  const template = schedule?.templates.find((item) => item.id === rule?.templateId);
                  const draft = dayRuleDraft[index] ?? {
                    templateId: rule?.templateId ?? schedule?.templates[0]?.id ?? "",
                    isWorking: rule?.isWorking ?? Boolean(schedule?.templates[0]),
                  };
                  return (
                    <div key={day} className="grid items-center gap-2 sm:grid-cols-[60px_1fr_auto]">
                      <span>{day}</span>
                      <select
                        value={draft.templateId}
                        onChange={(event) =>
                          setDayRuleDraft((current) => ({
                            ...current,
                            [index]: { ...draft, templateId: event.target.value },
                          }))
                        }
                        className="rounded border px-2 py-1 text-xs"
                      >
                        <option value="">Not set</option>
                        {schedule?.templates.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.isWorking}
                          onChange={(event) =>
                            setDayRuleDraft((current) => ({
                              ...current,
                              [index]: { ...draft, isWorking: event.target.checked },
                            }))
                          }
                        />{" "}
                        working
                      </label>
                      {rule && template ? (
                        <span className="sm:col-span-3 text-neutral-500">
                          Current: {template.title} ({template.startTime}-{template.endTime})
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => void saveDayRules()} className="mt-3 rounded border px-3 py-1.5 text-sm">
                Save day rules
              </button>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-semibold">Exceptions</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <input
                  type="date"
                  value={exceptionDate}
                  onChange={(event) => setExceptionDate(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                />
                <select
                  value={exceptionType}
                  onChange={(event) => setExceptionType(event.target.value as "OFF" | "SHIFT")}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="OFF">Off day</option>
                  <option value="SHIFT">Shift</option>
                </select>
                {exceptionType === "SHIFT" ? (
                  <>
                    <input
                      type="text"
                      value={exceptionStart}
                      onChange={(event) => setExceptionStart(event.target.value)}
                      placeholder="HH:MM"
                      className="rounded border px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      value={exceptionEnd}
                      onChange={(event) => setExceptionEnd(event.target.value)}
                      placeholder="HH:MM"
                      className="rounded border px-2 py-1 text-sm"
                    />
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void addException()}
                disabled={saving}
                className="mt-3 rounded-lg border px-3 py-1.5 text-sm"
              >
                Add exception
              </button>
              <div className="mt-3 space-y-1 text-xs">
                {schedule?.exceptions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded border px-2 py-1">
                    <span>
                      {item.date} · {item.type}
                      {item.type === "SHIFT" && item.startTime && item.endTime
                        ? ` (${item.startTime}-${item.endTime})`
                        : ""}
                    </span>
                    <button type="button" onClick={() => void removeException(item.id)} className="text-red-600">
                      remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-semibold">Recent blocks</div>
              <div className="mt-2 space-y-1 text-xs text-neutral-600">
                {schedule?.blocks.map((item) => (
                  <div key={item.id}>
                    {new Date(item.startAt).toLocaleString()} - {new Date(item.endAt).toLocaleString()} · {item.type}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && tab === "portfolio" ? (
          <div className="mt-4 space-y-3 rounded-xl border p-4">
            <div className="text-sm font-semibold">Profile and activity</div>
            <input
              type="text"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Display name"
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={profileTagline}
              onChange={(event) => setProfileTagline(event.target.value)}
              placeholder="Tagline"
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <label className="text-sm">
              <input
                type="checkbox"
                checked={profileActive}
                onChange={(event) => setProfileActive(event.target.checked)}
              />{" "}
              Active
            </label>
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
