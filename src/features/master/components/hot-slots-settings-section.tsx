"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { moneyRUBPlain } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

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
  embedded?: boolean;
};

const TRIGGER_OPTIONS = [48, 24, 12, 0] as const;
const PERCENT_OPTIONS = [10, 20, 30] as const;

export function HotSlotsSettingsSection({
  services,
  scope = "MASTER",
  embedded = false,
}: HotSlotsSettingsSectionProps) {
  const text = UI_TEXT.settings.hotSlots;
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
      const res = await fetch(`/api/provider/hot-slots/rule${scopeQuery}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ rule: RuleState }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : text.loadFailed);
      }
      setRule(json.data.rule);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [scopeQuery, text.loadFailed]);

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
        throw new Error(text.manualRequired);
      }
      if (rule.applyMode === "PRICE_FROM" && (!rule.minPriceFrom || rule.minPriceFrom <= 0)) {
        throw new Error(text.minPriceRequired);
      }
      const res = await fetch(`/api/provider/hot-slots/rule${scopeQuery}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ rule: RuleState }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : text.saveFailed);
      }
      setRule(json.data.rule);
      setStatus(UI_TEXT.common.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [rule, scopeQuery, text.manualRequired, text.minPriceRequired, text.saveFailed]);

  if (loading) {
    return (
      <div className={embedded ? "p-4 text-sm text-text-sec" : "rounded-2xl bg-white/4 p-4 text-sm text-text-sec"}>
        {UI_TEXT.common.loading}
      </div>
    );
  }

  if (!rule) {
    return (
      <div className={embedded ? "p-4" : "rounded-2xl bg-white/4 p-4"}>
        <p className="text-sm text-text-sec">{text.unavailable}</p>
        {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  const triggerLabel = (value: (typeof TRIGGER_OPTIONS)[number]) => {
    if (value === 48) return text.trigger48;
    if (value === 24) return text.trigger24;
    if (value === 12) return text.trigger12;
    return text.triggerDay;
  };

  return (
    <div className={embedded ? "space-y-4 p-4" : "space-y-4 rounded-2xl bg-white/4 p-4"}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{text.title}</p>
          <p className="mt-0.5 text-xs text-text-sec">{text.description}</p>
        </div>
        <Switch
          checked={rule.isEnabled}
          onCheckedChange={(checked) => updateRule({ isEnabled: checked })}
          className="shrink-0"
        />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{text.whenToApply}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TRIGGER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => updateRule({ triggerHours: option })}
              className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
                rule.triggerHours === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/8 text-text-main hover:bg-white/12"
              }`}
            >
              {triggerLabel(option)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{text.discountType}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateRule({ discountType: "PERCENT", discountValue: 10 })}
            className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
              rule.discountType === "PERCENT"
                ? "bg-primary text-primary-foreground"
                : "bg-white/8 text-text-main hover:bg-white/12"
            }`}
          >
            {text.percent}
          </button>
          <button
            type="button"
            onClick={() => updateRule({ discountType: "FIXED", discountValue: 500 })}
            className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
              rule.discountType === "FIXED"
                ? "bg-primary text-primary-foreground"
                : "bg-white/8 text-text-main hover:bg-white/12"
            }`}
          >
            {text.fixedAmount}
          </button>
        </div>

        {rule.discountType === "PERCENT" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {PERCENT_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => updateRule({ discountValue: value })}
                className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
                  rule.discountValue === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/8 text-text-main hover:bg-white/12"
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
              className="h-10 w-32 rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-text-sec">{UI_TEXT.common.currencyRub}</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{text.applyMode}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateRule({ applyMode: "ALL_SERVICES" })}
            className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
              rule.applyMode === "ALL_SERVICES"
                ? "bg-primary text-primary-foreground"
                : "bg-white/8 text-text-main hover:bg-white/12"
            }`}
          >
            {text.applyAll}
          </button>
          <button
            type="button"
            onClick={() => updateRule({ applyMode: "PRICE_FROM" })}
            className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
              rule.applyMode === "PRICE_FROM"
                ? "bg-primary text-primary-foreground"
                : "bg-white/8 text-text-main hover:bg-white/12"
            }`}
          >
            {text.applyFrom}
          </button>
          <button
            type="button"
            onClick={() => updateRule({ applyMode: "MANUAL" })}
            className={`rounded-xl px-3 py-1.5 text-xs transition-colors ${
              rule.applyMode === "MANUAL"
                ? "bg-primary text-primary-foreground"
                : "bg-white/8 text-text-main hover:bg-white/12"
            }`}
          >
            {text.applyManual}
          </button>
        </div>

        {rule.applyMode === "PRICE_FROM" ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={rule.minPriceFrom ?? 0}
              onChange={(event) => updateRule({ minPriceFrom: Number(event.target.value) || 0 })}
              className="h-10 w-32 rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-text-sec">{UI_TEXT.common.currencyRub}</span>
          </div>
        ) : null}

        {rule.applyMode === "MANUAL" ? (
          <div className="mt-2 w-full min-w-0 rounded-xl bg-white/6 p-3">
            {enabledServices.length === 0 ? (
              <p className="text-xs text-text-sec">{text.noServices}</p>
            ) : (
              <div className="space-y-2">
                {enabledServices.map((service) => (
                  <div key={service.serviceId} className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-text-main">{service.title}</p>
                      <p className="truncate text-xs text-text-sec">
                        {moneyRUBPlain(service.effectivePrice)} {UI_TEXT.common.currencyRub} / {service.effectiveDurationMin} {UI_TEXT.common.minutesShort}
                      </p>
                    </div>
                    <Switch
                      checked={rule.serviceIds.includes(service.serviceId)}
                      onCheckedChange={(checked) => toggleService(service.serviceId, checked)}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      {status ? <p className="text-xs text-text-sec">{status}</p> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void saveRule()}
          disabled={saving}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
        >
          {saving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
        </button>
      </div>
    </div>
  );
}
