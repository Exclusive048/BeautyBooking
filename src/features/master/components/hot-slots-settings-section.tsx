"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { moneyRUBPlain } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";

type RuleState = {
  isEnabled: boolean;
  triggerHours: number;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  applyMode: "ALL_SERVICES" | "PRICE_FROM" | "MANUAL";
  minPriceFrom: number | null;
  serviceIds: string[];
};

type ServiceItem = {
  serviceId: string;
  title: string;
  isEnabled: boolean;
  effectivePrice: number;
  effectiveDurationMin: number;
};

type HotSlotsSettingsSectionProps = {
  services: ServiceItem[];
  scope?: "MASTER" | "STUDIO";
};

const TRIGGER_OPTIONS = [
  { value: 48, label: "За 48 ч" },
  { value: 24, label: "За 24 ч" },
  { value: 12, label: "За 12 ч" },
  { value: 0, label: "В день записи" },
];

const PERCENT_OPTIONS = [10, 20, 30];


export function HotSlotsSettingsSection({ services, scope = "MASTER" }: HotSlotsSettingsSectionProps) {
  const [rule, setRule] = useState<RuleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const enabledServices = useMemo(() => services.filter((service) => service.isEnabled), [services]);
  const scopeQuery = scope === "STUDIO" ? "?scope=STUDIO" : "?scope=MASTER";

  const loadRule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider/hot-slots/rule${scopeQuery}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ rule: RuleState }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить правила.");
      }
      setRule(json.data.rule);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить правила.");
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => {
    void loadRule();
  }, [loadRule]);

  const updateRule = (patch: Partial<RuleState>) => {
    setRule((prev) => (prev ? { ...prev, ...patch } : prev));
    setStatus(null);
  };

  const toggleService = (serviceId: string, checked: boolean) => {
    if (!rule) return;
    const next = checked
      ? Array.from(new Set([...rule.serviceIds, serviceId]))
      : rule.serviceIds.filter((id) => id !== serviceId);
    updateRule({ serviceIds: next });
  };

  const saveRule = useCallback(async () => {
    if (!rule) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      if (rule.applyMode === "MANUAL" && rule.serviceIds.length === 0) {
        throw new Error("Выберите хотя бы одну услугу.");
      }
      if (rule.applyMode === "PRICE_FROM" && (!rule.minPriceFrom || rule.minPriceFrom <= 0)) {
        throw new Error("Укажите минимальную цену для правила.");
      }
      const res = await fetch(`/api/provider/hot-slots/rule${scopeQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ rule: RuleState }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить правило.");
      }
      setRule(json.data.rule);
      setStatus("Сохранено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить правило.");
    } finally {
      setSaving(false);
    }
  }, [rule, scopeQuery]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-bg-card/90 p-4">
        <div className="text-sm text-text-sec">Загрузка настроек...</div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="rounded-2xl bg-bg-card/90 p-4">
        <div className="text-sm text-text-sec">Правило пока недоступно.</div>
        {error ? <div className="mt-2 text-xs text-rose-400">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-card/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Горящие окошки</h4>
          <p className="mt-1 text-xs text-text-sec">
            Автоскидки на свободные слоты в выбранный период.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.isEnabled}
            onChange={(event) => updateRule({ isEnabled: event.target.checked })}
          />
          {rule.isEnabled ? "Включено" : "Выключено"}
        </label>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-text-main">Когда включать скидку</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRIGGER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateRule({ triggerHours: option.value })}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  rule.triggerHours === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-text-main">Размер скидки</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateRule({ discountType: "PERCENT", discountValue: 10 })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                rule.discountType === "PERCENT"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
              }`}
            >
              Процент
            </button>
            <button
              type="button"
              onClick={() => updateRule({ discountType: "FIXED", discountValue: 500 })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                rule.discountType === "FIXED"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
              }`}
            >
              Фиксированная сумма
            </button>
          </div>

          {rule.discountType === "PERCENT" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {PERCENT_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateRule({ discountValue: value })}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    rule.discountValue === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={100}
                max={5000}
                value={Number.isFinite(rule.discountValue) ? rule.discountValue : 0}
                onChange={(event) => updateRule({ discountValue: Number(event.target.value) || 0 })}
                className="h-9 w-32 rounded-lg border border-border-subtle bg-bg-input px-3 text-sm"
              />
              <span className="text-xs text-text-sec">₽</span>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-text-main">Применение скидки</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateRule({ applyMode: "ALL_SERVICES" })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                rule.applyMode === "ALL_SERVICES"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
              }`}
            >
              На все услуги
            </button>
            <button
              type="button"
              onClick={() => updateRule({ applyMode: "PRICE_FROM" })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                rule.applyMode === "PRICE_FROM"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
              }`}
            >
              Только дороже…
            </button>
            <button
              type="button"
              onClick={() => updateRule({ applyMode: "MANUAL" })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                rule.applyMode === "MANUAL"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"
              }`}
            >
              Выбрать услуги
            </button>
          </div>

          {rule.applyMode === "PRICE_FROM" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={rule.minPriceFrom ?? 0}
                onChange={(event) => updateRule({ minPriceFrom: Number(event.target.value) || 0 })}
                className="h-9 w-32 rounded-lg border border-border-subtle bg-bg-input px-3 text-sm"
              />
              <span className="text-xs text-text-sec">₽</span>
            </div>
          ) : null}

          {rule.applyMode === "MANUAL" ? (
            <div className="mt-2 rounded-xl border border-border-subtle bg-bg-input/70 p-3">
              {enabledServices.length === 0 ? (
                <div className="text-xs text-text-sec">Нет активных услуг.</div>
              ) : (
                <div className="space-y-2">
                  {enabledServices.map((service) => (
                    <label key={service.serviceId} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-text-main">{service.title}</span>
                      <span className="text-text-sec">
                        {moneyRUBPlain(service.effectivePrice)} ₽ / {service.effectiveDurationMin} мин
                      </span>
                      <input
                        type="checkbox"
                        checked={rule.serviceIds.includes(service.serviceId)}
                        onChange={(event) => toggleService(service.serviceId, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="mt-3 text-xs text-rose-400">{error}</div> : null}
      {status ? <div className="mt-3 text-xs text-emerald-500">{status}</div> : null}

      <div className="mt-4 flex justify-end">
        <Button onClick={() => void saveRule()} disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
