"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { timeToMinutes } from "@/lib/schedule/time";

type OverrideItem = {
  date: string;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks?: { startLocal: string; endLocal: string }[];
  reason?: string | null;
};

type BlockItem = {
  id: string;
  date: string;
  startLocal: string;
  endLocal: string;
  reason: string | null;
};

type ExceptionRow = {
  kind: "OVERRIDE" | "BLOCK";
  date: string;
  isDayOff?: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: { startLocal: string; endLocal: string }[];
  reason?: string | null;
  blockId?: string;
};

type BreakDraft = { startLocal: string; endLocal: string };

type Props = {
  overridesEndpoint: string;
  blocksEndpoint: string;
  rangeDays?: number;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function ScheduleExceptionsPanel({ overridesEndpoint, blocksEndpoint, rangeDays = 14 }: Props) {
  const [overrides, setOverrides] = useState<OverrideItem[]>([]);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [type, setType] = useState<"DAY_OFF" | "SPECIAL">("DAY_OFF");
  const [startLocal, setStartLocal] = useState("09:00");
  const [endLocal, setEndLocal] = useState("18:00");
  const [breaks, setBreaks] = useState<BreakDraft[]>([]);
  const [reason, setReason] = useState("");

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + rangeDays);
    return { from, to };
  }, [rangeDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overridesUrl = new URL(overridesEndpoint, window.location.origin);
      overridesUrl.searchParams.set("from", range.from.toISOString());
      overridesUrl.searchParams.set("to", range.to.toISOString());

      const blocksUrl = new URL(blocksEndpoint, window.location.origin);
      blocksUrl.searchParams.set("from", range.from.toISOString());
      blocksUrl.searchParams.set("to", range.to.toISOString());

      const [overridesRes, blocksRes] = await Promise.all([
        fetch(overridesUrl.toString(), { cache: "no-store" }),
        fetch(blocksUrl.toString(), { cache: "no-store" }),
      ]);

      const overridesJson = (await overridesRes.json().catch(() => null)) as
        | ApiResponse<{ overrides: OverrideItem[] }>
        | null;
      const blocksJson = (await blocksRes.json().catch(() => null)) as
        | ApiResponse<{ blocks: BlockItem[] }>
        | null;

      if (!overridesRes.ok) throw new Error(getErrorMessage(overridesJson, "Failed to load exceptions"));
      if (!overridesJson || !overridesJson.ok)
        throw new Error(getErrorMessage(overridesJson, "Failed to load exceptions"));

      if (!blocksRes.ok) throw new Error(getErrorMessage(blocksJson, "Failed to load blocks"));
      if (!blocksJson || !blocksJson.ok) throw new Error(getErrorMessage(blocksJson, "Failed to load blocks"));

      setOverrides(overridesJson.data.overrides ?? []);
      setBlocks(blocksJson.data.blocks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [overridesEndpoint, blocksEndpoint, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const validateBreaks = () => {
    if (type !== "SPECIAL") return null;
    const dayStart = timeToMinutes(startLocal);
    const dayEnd = timeToMinutes(endLocal);
    if (dayStart === null || dayEnd === null || dayStart >= dayEnd) {
      return "Некорректный интервал спец-графика";
    }
    if (breaks.length > 3) {
      return "Слишком много перерывов";
    }
    const parsed = breaks.map((b) => ({
      start: timeToMinutes(b.startLocal),
      end: timeToMinutes(b.endLocal),
    }));
    for (const b of parsed) {
      if (b.start === null || b.end === null || b.start >= b.end) {
        return "Некорректный перерыв";
      }
      if (b.start <= dayStart || b.end >= dayEnd) {
        return "Перерыв вне окна спец-графика";
      }
    }
    const sorted = parsed.slice().sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.start === null || prev.end === null || curr.start === null || curr.end === null) continue;
      if (curr.start < prev.end) return "Перерывы пересекаются";
    }
    return null;
  };

  const addBreak = () => {
    if (breaks.length >= 3) return;
    setBreaks((prev) => [...prev, { startLocal: "13:00", endLocal: "14:00" }]);
  };

  const save = async () => {
    if (!date) {
      setError("Укажите дату");
      return;
    }
    const validationError = validateBreaks();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(overridesEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          isDayOff: type === "DAY_OFF",
          startLocal: type === "SPECIAL" ? startLocal : undefined,
          endLocal: type === "SPECIAL" ? endLocal : undefined,
          breaks: type === "SPECIAL" ? breaks : undefined,
          reason: reason.trim() ? reason.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ override: OverrideItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to save exception"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to save exception"));
      setReason("");
      setBreaks([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (dateValue: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(overridesEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateValue }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ date: string }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to remove exception"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to remove exception"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(blocksEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: id }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to remove block"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to remove block"));
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const list: ExceptionRow[] = useMemo(() => {
    const overrideRows = overrides.map((item) => ({
      kind: "OVERRIDE" as const,
      date: item.date,
      isDayOff: item.isDayOff,
      startLocal: item.startLocal,
      endLocal: item.endLocal,
      breaks: item.breaks,
      reason: item.reason ?? null,
    }));

    const blockRows = blocks.map((b) => ({
      kind: "BLOCK" as const,
      date: b.date,
      startLocal: b.startLocal,
      endLocal: b.endLocal,
      reason: b.reason ?? null,
      blockId: b.id,
    }));

    return [...overrideRows, ...blockRows].sort((a, b) => a.date.localeCompare(b.date));
  }, [overrides, blocks]);

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка...</div>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Исключение</div>
        <div className="grid gap-3 md:grid-cols-[160px_180px_1fr] items-center">
          <input
            type="date"
            className="rounded-xl border px-3 py-2 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as "DAY_OFF" | "SPECIAL")}
          >
            <option value="DAY_OFF">Выходной</option>
            <option value="SPECIAL">Спец-график</option>
          </select>
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Комментарий (опционально)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {type === "SPECIAL" ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr] items-center">
              <div className="text-xs font-medium text-neutral-500">Окно</div>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-neutral-500">Перерывы</div>
              {breaks.map((br, idx) => (
                <div key={`break-${idx}`} className="flex flex-wrap items-center gap-2">
                  <input
                    className="rounded-lg border px-2 py-1 text-sm w-24"
                    value={br.startLocal}
                    onChange={(e) =>
                      setBreaks((prev) =>
                        prev.map((b, i) => (i === idx ? { ...b, startLocal: e.target.value } : b))
                      )
                    }
                  />
                  <span className="text-sm text-neutral-500">—</span>
                  <input
                    className="rounded-lg border px-2 py-1 text-sm w-24"
                    value={br.endLocal}
                    onChange={(e) =>
                      setBreaks((prev) =>
                        prev.map((b, i) => (i === idx ? { ...b, endLocal: e.target.value } : b))
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setBreaks((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </div>
              ))}
              {breaks.length < 3 ? (
                <button
                  type="button"
                  onClick={addBreak}
                  className="text-xs font-medium text-neutral-700 hover:underline"
                >
                  + Добавить перерыв
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Добавляем..." : "Добавить"}
        </button>
      </div>

      <div className="rounded-2xl border p-4 space-y-2">
        <div className="text-sm font-semibold">Исключения</div>
        {list.length === 0 ? (
          <div className="text-sm text-neutral-600">Нет исключений в выбранном диапазоне.</div>
        ) : (
          <div className="space-y-2">
            {list.map((item) => (
              <div key={`${item.kind}-${item.date}-${item.blockId ?? ""}`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium">{item.date.slice(0, 10)}</span>{" "}
                  {item.kind === "BLOCK" ? (
                    <span className="text-xs text-neutral-500">(legacy блокировка)</span>
                  ) : item.isDayOff ? (
                    "— выходной"
                  ) : (
                    <>— {item.startLocal ?? ""}-{item.endLocal ?? ""}</>
                  )}
                  {item.breaks && item.breaks.length > 0 ? (
                    <div className="text-xs text-neutral-500">
                      Перерывы: {item.breaks.map((b) => `${b.startLocal}-${b.endLocal}`).join(", ")}
                    </div>
                  ) : null}
                  {item.reason ? (
                    <div className="text-xs text-neutral-500">Комментарий: {item.reason}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    item.kind === "BLOCK" && item.blockId
                      ? removeBlock(item.blockId)
                      : removeOverride(item.date)
                  }
                  disabled={saving}
                  className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
