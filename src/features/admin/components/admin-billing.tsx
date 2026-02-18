"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moneyRUBPlain } from "@/lib/format";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/types/api";
import type { PlanFeatures } from "@/lib/billing/types";

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  features: Record<string, unknown>;
  sortOrder: number;
  inheritsFromPlanId: string | null;
  isActive: boolean;
  updatedAt: string;
};

type BillingResponse = {
  plans: BillingPlan[];
};

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type LimitFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends number | null ? Key : never;
}[keyof PlanFeatures];

const BOOLEAN_FEATURES: Array<{ key: BooleanFeatureKey; label: string }> = [
  { key: "onlinePayments", label: "Online payments" },
  { key: "hotSlots", label: "Hot slots" },
  { key: "analyticsCharts", label: "Analytics charts" },
  { key: "financeReport", label: "Finance report" },
  { key: "tgNotifications", label: "Notifications: Telegram" },
  { key: "vkNotifications", label: "Notifications: VK" },
  { key: "maxNotifications", label: "Notifications: Max" },
  { key: "smsNotifications", label: "Notifications: SMS" },
  { key: "clientVisitHistory", label: "Client visit history" },
  { key: "clientNotes", label: "Client notes" },
  { key: "clientImport", label: "Client import" },
  { key: "highlightCard", label: "Highlighted card" },
];

const LIMIT_FEATURES: Array<{ key: LimitFeatureKey; label: string }> = [
  { key: "maxTeamMasters", label: "Team masters limit" },
  { key: "maxPortfolioPhotosSolo", label: "Portfolio (solo master)" },
  { key: "maxPortfolioPhotosStudioDesign", label: "Portfolio (studio design)" },
  { key: "maxPortfolioPhotosPerStudioMaster", label: "Portfolio (studio master)" },
];

const DEFAULT_FEATURES: PlanFeatures = {
  onlinePayments: false,
  hotSlots: false,
  analyticsCharts: false,
  financeReport: false,
  tgNotifications: false,
  vkNotifications: false,
  maxNotifications: false,
  smsNotifications: false,
  clientVisitHistory: false,
  clientNotes: false,
  clientImport: false,
  catalogPriority: "FREE",
  highlightCard: false,
  maxTeamMasters: 2,
  maxPortfolioPhotosSolo: 15,
  maxPortfolioPhotosStudioDesign: 15,
  maxPortfolioPhotosPerStudioMaster: 10,
};

const CATALOG_PRIORITY_OPTIONS: Array<{ value: PlanFeatures["catalogPriority"]; label: string }> = [
  { value: "FREE", label: "FREE" },
  { value: "PRO", label: "PRO" },
  { value: "PREMIUM", label: "PREMIUM" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBoolean(record: Record<string, unknown>, key: keyof PlanFeatures): boolean | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumberOrNull(
  record: Record<string, unknown>,
  key: keyof PlanFeatures
): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCatalogPriority(record: Record<string, unknown>): PlanFeatures["catalogPriority"] | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, "catalogPriority")) return undefined;
  const value = record.catalogPriority;
  if (typeof value !== "string") return undefined;
  if (value === "FREE" || value === "PRO" || value === "PREMIUM") return value;
  return undefined;
}

function parseOverrides(raw: unknown): Partial<PlanFeatures> {
  if (!isRecord(raw)) return {};
  const record = raw;
  const overrides: Partial<PlanFeatures> = {};

  for (const feature of BOOLEAN_FEATURES) {
    const value = readBoolean(record, feature.key);
    if (typeof value === "boolean") overrides[feature.key] = value;
  }

  for (const feature of LIMIT_FEATURES) {
    const value = readNumberOrNull(record, feature.key);
    if (value !== undefined) overrides[feature.key] = value;
  }

  const catalogPriority = readCatalogPriority(record);
  if (catalogPriority) overrides.catalogPriority = catalogPriority;

  return overrides;
}

function mergeFeatures(base: PlanFeatures, override: Partial<PlanFeatures>): PlanFeatures {
  return {
    onlinePayments: override.onlinePayments ?? base.onlinePayments,
    hotSlots: override.hotSlots ?? base.hotSlots,
    analyticsCharts: override.analyticsCharts ?? base.analyticsCharts,
    financeReport: override.financeReport ?? base.financeReport,
    tgNotifications: override.tgNotifications ?? base.tgNotifications,
    vkNotifications: override.vkNotifications ?? base.vkNotifications,
    maxNotifications: override.maxNotifications ?? base.maxNotifications,
    smsNotifications: override.smsNotifications ?? base.smsNotifications,
    clientVisitHistory: override.clientVisitHistory ?? base.clientVisitHistory,
    clientNotes: override.clientNotes ?? base.clientNotes,
    clientImport: override.clientImport ?? base.clientImport,
    catalogPriority: override.catalogPriority ?? base.catalogPriority,
    highlightCard: override.highlightCard ?? base.highlightCard,
    maxTeamMasters: override.maxTeamMasters !== undefined ? override.maxTeamMasters : base.maxTeamMasters,
    maxPortfolioPhotosSolo:
      override.maxPortfolioPhotosSolo !== undefined
        ? override.maxPortfolioPhotosSolo
        : base.maxPortfolioPhotosSolo,
    maxPortfolioPhotosStudioDesign:
      override.maxPortfolioPhotosStudioDesign !== undefined
        ? override.maxPortfolioPhotosStudioDesign
        : base.maxPortfolioPhotosStudioDesign,
    maxPortfolioPhotosPerStudioMaster:
      override.maxPortfolioPhotosPerStudioMaster !== undefined
        ? override.maxPortfolioPhotosPerStudioMaster
        : base.maxPortfolioPhotosPerStudioMaster,
  };
}

function resolveEffectiveFeatures(
  planId: string,
  plansById: Map<string, BillingPlan>,
  visited = new Set<string>(),
  depth = 0
): PlanFeatures {
  if (depth >= 5) return { ...DEFAULT_FEATURES };
  const plan = plansById.get(planId);
  if (!plan) return { ...DEFAULT_FEATURES };
  if (visited.has(planId)) return { ...DEFAULT_FEATURES };
  visited.add(planId);

  const base =
    plan.inheritsFromPlanId && plansById.has(plan.inheritsFromPlanId)
      ? resolveEffectiveFeatures(plan.inheritsFromPlanId, plansById, visited, depth + 1)
      : { ...DEFAULT_FEATURES };

  const overrides = parseOverrides(plan.features);
  return mergeFeatures(base, overrides);
}

function buildOverrides(current: PlanFeatures, base: PlanFeatures | null): Record<string, unknown> {
  if (!base) return { ...current };
  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current) as Array<[keyof PlanFeatures, PlanFeatures[keyof PlanFeatures]]>) {
    const baseValue = base[key];
    if (value !== baseValue) {
      overrides[key] = value;
    }
  }
  return overrides;
}


export function AdminBilling() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<BillingPlan | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState("");
  const [editingInheritsFromPlanId, setEditingInheritsFromPlanId] = useState<string | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<PlanFeatures | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<BillingResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить тарифы");
      }
      setPlans(json.data.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить тарифы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (plan: BillingPlan) => {
    setActivePlan(plan);
    setEditingName(plan.name);
    setEditingPrice(String(plan.price));
    setEditingSortOrder(String(plan.sortOrder ?? 0));
    setEditingInheritsFromPlanId(plan.inheritsFromPlanId ?? null);
    setEditingFeatures(
      effectiveFeaturesById.get(plan.id) ?? { ...DEFAULT_FEATURES }
    );
  };

  const closeEdit = () => {
    setActivePlan(null);
    setEditingName("");
    setEditingPrice("");
    setEditingSortOrder("");
    setEditingInheritsFromPlanId(null);
    setEditingFeatures(null);
  };

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const effectiveFeaturesById = useMemo(() => {
    const map = new Map<string, PlanFeatures>();
    for (const plan of plans) {
      map.set(plan.id, resolveEffectiveFeatures(plan.id, plansById));
    }
    return map;
  }, [plans, plansById]);

  const savePlan = async () => {
    if (!activePlan) return;
    setSaving(true);
    setError(null);
    const priceValue = Number(editingPrice);
    const sortOrderValue = Number(editingSortOrder);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      setError("Введите корректную цену.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(sortOrderValue)) {
      setError("Введите корректный порядок сортировки.");
      setSaving(false);
      return;
    }

    const resolvedFeatures = editingFeatures ?? { ...DEFAULT_FEATURES };
    const baseFeatures = editingInheritsFromPlanId
      ? effectiveFeaturesById.get(editingInheritsFromPlanId) ?? null
      : null;
    const featureOverrides = buildOverrides(resolvedFeatures, baseFeatures);

    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePlan.id,
          name: editingName,
          price: priceValue,
          sortOrder: sortOrderValue,
          inheritsFromPlanId: editingInheritsFromPlanId,
          features: featureOverrides,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить тариф");
      }
      await load();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить тариф");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Финансы и тарифы</h1>
        <p className="mt-1 text-sm text-text-sec">Управляйте тарифными планами и платежной логикой.</p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-main">Tariff plans</h2>

        {loading ? (
          <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Loading...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const effective = effectiveFeaturesById.get(plan.id) ?? { ...DEFAULT_FEATURES };
              return (
                <Card key={plan.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-text-main">{plan.name}</div>
                        <div className="mt-1 text-sm text-text-sec">{plan.code}</div>
                      </div>
                      <div className="text-sm font-semibold text-text-main">
                        {plan.price <= 0 ? "Free" : `${moneyRUBPlain(plan.price)} KZT/mo`}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <ul className="space-y-2 text-sm text-text-sec">
                      {BOOLEAN_FEATURES.map((feature) => (
                        <li key={feature.key} className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              effective[feature.key] ? "bg-emerald-500" : "bg-neutral-300"
                            }`}
                          />
                          <span className={effective[feature.key] ? "text-text-main" : "text-text-sec"}>
                            {feature.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-text-sec">Catalog priority: {effective.catalogPriority}</div>
                    <div className="text-xs text-text-sec">
                      Team masters limit: {effective.maxTeamMasters ?? "Unlimited"}
                    </div>
                    <div className="pt-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(plan)}>
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-main">История транзакций</h2>
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">
          История транзакций появится позже.
        </div>
      </section>

            <ModalSurface open={Boolean(activePlan)} onClose={closeEdit} title="Edit plan">
        {activePlan ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Name</label>
                <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Price (per month)</label>
                <Input
                  value={editingPrice}
                  onChange={(e) => setEditingPrice(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Sort order</label>
                <Input
                  value={editingSortOrder}
                  onChange={(e) => setEditingSortOrder(e.target.value.replace(/[^\d-]/g, ""))}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Inherits from</label>
                <select
                  value={editingInheritsFromPlanId ?? ""}
                  onChange={(event) =>
                    setEditingInheritsFromPlanId(event.target.value || null)
                  }
                  className="h-10 rounded-lg border border-border-subtle bg-bg-input px-3 text-sm"
                >
                  <option value="">No inheritance</option>
                  {plans
                    .filter((plan) => plan.id !== activePlan.id)
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Catalog priority</label>
                <select
                  value={(editingFeatures ?? DEFAULT_FEATURES).catalogPriority}
                  onChange={(event) =>
                    setEditingFeatures((prev) => ({
                      ...(prev ?? { ...DEFAULT_FEATURES }),
                      catalogPriority: event.target.value as PlanFeatures["catalogPriority"],
                    }))
                  }
                  className="h-10 rounded-lg border border-border-subtle bg-bg-input px-3 text-sm"
                >
                  {CATALOG_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-sec">Features</div>
              <div className="grid gap-2 md:grid-cols-2">
                {BOOLEAN_FEATURES.map((feature) => (
                  <label key={feature.key} className="flex items-center gap-2 text-sm text-text-main">
                    <input
                      type="checkbox"
                      checked={Boolean((editingFeatures ?? DEFAULT_FEATURES)[feature.key])}
                      onChange={(event) =>
                        setEditingFeatures((prev) => ({
                          ...(prev ?? { ...DEFAULT_FEATURES }),
                          [feature.key]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {feature.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-sec">Limits (empty = unlimited)</div>
              <div className="grid gap-2 md:grid-cols-2">
                {LIMIT_FEATURES.map((feature) => {
                  const value = (editingFeatures ?? DEFAULT_FEATURES)[feature.key];
                  return (
                    <label key={feature.key} className="space-y-1 text-sm text-text-main">
                      <span className="text-xs text-text-sec">{feature.label}</span>
                      <Input
                        type="number"
                        value={value === null ? "" : String(value)}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setEditingFeatures((prev) => ({
                            ...(prev ?? { ...DEFAULT_FEATURES }),
                            [feature.key]: raw === "" ? null : Number(raw),
                          }));
                        }}
                        placeholder="Unlimited"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeEdit} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={savePlan} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}
