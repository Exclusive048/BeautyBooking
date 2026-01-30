"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterItem = {
  id: string;
  name: string;
};

type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  isEnabled: boolean;
};

type OverrideItem = {
  id: string;
  masterProviderId: string;
  serviceId: string;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  isEnabled: boolean;
};

type Props = {
  studioId: string;
};

type EditableOverride = {
  priceOverride: string;
  durationOverrideMin: string;
  isEnabled: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioOverridesPanel({ studioId }: Props) {
  const [masters, setMasters] = useState<MasterItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
  const [overrides, setOverrides] = useState<OverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mastersEndpoint = useMemo(() => `/api/studios/${studioId}/masters`, [studioId]);
  const servicesEndpoint = useMemo(() => `/api/studios/${studioId}/services`, [studioId]);

  const loadMastersAndServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mastersRes, servicesRes] = await Promise.all([
        fetch(mastersEndpoint, { cache: "no-store" }),
        fetch(servicesEndpoint, { cache: "no-store" }),
      ]);

      const mastersJson = (await mastersRes.json().catch(() => null)) as
        | ApiResponse<{ masters: MasterItem[] }>
        | null;
      const servicesJson = (await servicesRes.json().catch(() => null)) as
        | ApiResponse<{ services: ServiceItem[] }>
        | null;

      if (!mastersRes.ok) throw new Error(getErrorMessage(mastersJson, "Failed to load masters"));
      if (!servicesRes.ok) throw new Error(getErrorMessage(servicesJson, "Failed to load services"));
      if (!mastersJson || !mastersJson.ok) {
        throw new Error(getErrorMessage(mastersJson, "Failed to load masters"));
      }
      if (!servicesJson || !servicesJson.ok) {
        throw new Error(getErrorMessage(servicesJson, "Failed to load services"));
      }

      setMasters(mastersJson.data.masters);
      setServices(servicesJson.data.services);
      setSelectedMasterId((prev) => prev || mastersJson.data.masters[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [mastersEndpoint, servicesEndpoint]);

  useEffect(() => {
    void loadMastersAndServices();
  }, [loadMastersAndServices]);

  const overridesEndpoint = useMemo(() => {
    if (!selectedMasterId) return "";
    return `/api/studios/${studioId}/masters/${selectedMasterId}/services`;
  }, [studioId, selectedMasterId]);

  const loadOverrides = useCallback(async () => {
    if (!overridesEndpoint) return;
    setError(null);
    try {
      const res = await fetch(overridesEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ overrides: OverrideItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load overrides"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load overrides"));
      setOverrides(json.data.overrides);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [overridesEndpoint]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const overrideMap = useMemo(() => {
    return new Map(overrides.map((o) => [o.serviceId, o]));
  }, [overrides]);

  const toNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const saveOverride = async (serviceId: string, draft: EditableOverride) => {
    if (!overridesEndpoint) return;
    setSavingId(serviceId);
    setError(null);
    try {
      const res = await fetch(overridesEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          priceOverride: toNumber(draft.priceOverride),
          durationOverrideMin: toNumber(draft.durationOverrideMin),
          isEnabled: draft.isEnabled,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ override: OverrideItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to save override"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to save override"));
      setOverrides((prev) => {
        const filtered = prev.filter((o) => o.serviceId !== serviceId);
        return [...filtered, json.data.override];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка данных...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">Мастер</div>
        <select
          className="rounded-xl border px-3 py-2 text-sm"
          value={selectedMasterId}
          onChange={(e) => setSelectedMasterId(e.target.value)}
        >
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      {services.length === 0 ? (
        <div className="rounded-2xl border p-4 text-sm text-neutral-600">
          Нет услуг студии.
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => {
            const current = overrideMap.get(service.id);
            const key = `${service.id}:${current?.priceOverride ?? ""}:${current?.durationOverrideMin ?? ""}:${
              current?.isEnabled ?? true
            }:${service.isEnabled}`;
            return (
              <OverrideRow
                key={key}
                service={service}
                initial={current}
                disabled={savingId === service.id}
                onSave={(draft) => saveOverride(service.id, draft)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  service,
  initial,
  disabled,
  onSave,
}: {
  service: ServiceItem;
  initial?: OverrideItem;
  disabled: boolean;
  onSave: (draft: EditableOverride) => void;
}) {
  const [draft, setDraft] = useState<EditableOverride>({
    priceOverride: initial?.priceOverride ? String(initial.priceOverride) : "",
    durationOverrideMin: initial?.durationOverrideMin ? String(initial.durationOverrideMin) : "",
    isEnabled: initial?.isEnabled ?? true,
  });

  const catalogEnabled = service.isEnabled;
  const rowDisabled = disabled || !catalogEnabled;

  return (
    <div className="rounded-2xl border p-4 space-y-2">
      <div className="font-medium">{service.name}</div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] items-center">
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          placeholder={`Цена (база ${service.price})`}
          value={draft.priceOverride}
          onChange={(e) => setDraft((s) => ({ ...s, priceOverride: e.target.value }))}
          disabled={rowDisabled}
        />
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          placeholder={`Длительность (база ${service.durationMin})`}
          value={draft.durationOverrideMin}
          onChange={(e) => setDraft((s) => ({ ...s, durationOverrideMin: e.target.value }))}
          disabled={rowDisabled}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalogEnabled ? draft.isEnabled : false}
            onChange={(e) => setDraft((s) => ({ ...s, isEnabled: e.target.checked }))}
            disabled={rowDisabled}
          />
          Включено
        </label>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={rowDisabled}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
      {!catalogEnabled ? (
        <div className="text-xs text-neutral-500">Услуга выключена в каталоге.</div>
      ) : null}
    </div>
  );
}
