"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";
import {
  FEATURE_CATALOG,
  type FeatureKey,
  type BooleanFeatureKey,
  type LimitFeatureKey,
} from "@/lib/billing/feature-catalog";
import {
  canDisableFeature,
  deriveUiState,
  getDefaultPlanFeatures,
  isRelaxedLimit,
  parseOverrides,
  resolveEffectiveFeatures,
  type FeatureUiState,
  type PlanFeatureOverrides,
  type PlanNode,
  type PlanTier,
} from "@/lib/billing/features";

type SubscriptionScope = "MASTER" | "STUDIO";

type PeriodMonths = 1 | 3 | 6 | 12;

const PERIODS: PeriodMonths[] = [1, 3, 6, 12];

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  features: Record<string, unknown>;
  sortOrder: number;
  inheritsFromPlanId: string | null;
  isActive: boolean;
  updatedAt: string;
  prices: BillingPlanPrice[];
};

type BillingPlanPrice = {
  id: string;
  periodMonths: PeriodMonths;
  priceKopeks: number;
  isActive: boolean;
};

type BillingResponse = {
  plans: BillingPlan[];
};

type ModalMode = "create" | "edit";

const TIER_ORDER: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
};

const TIER_LABEL: Record<PlanTier, string> = {
  FREE: "Бесплатный",
  PRO: "PRO",
  PREMIUM: "Премиум",
};

const PROVIDER_LABEL: Record<SubscriptionScope, string> = {
  MASTER: "Мастер",
  STUDIO: "Студия",
};

const MODAL_TABS: TabItem[] = [
  { id: "main", label: "Основное" },
  { id: "features", label: "Функции" },
];

function buildPlanMap(plans: BillingPlan[]): Map<string, PlanNode> {
  return new Map(
    plans.map((plan) => [
      plan.id,
      {
        id: plan.id,
        inheritsFromPlanId: plan.inheritsFromPlanId,
        features: plan.features,
      },
    ])
  );
}

function filterCatalog(
  scope: SubscriptionScope
): Array<[FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]> {
  return (Object.entries(FEATURE_CATALOG) as Array<
    [FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]
  >)
    .filter(([, def]) => def.appliesTo === "BOTH" || def.appliesTo === scope)
    .sort((a, b) => a[1].uiOrder - b[1].uiOrder);
}

function groupCatalog(entries: Array<[FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]>) {
  const groups = new Map<string, Array<[FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]>>();
  for (const entry of entries) {
    const group = entry[1].group;
    const current = groups.get(group) ?? [];
    current.push(entry);
    groups.set(group, current);
  }
  return Array.from(groups.entries());
}

function getPriceForPeriod(plan: BillingPlan, periodMonths: PeriodMonths) {
  return plan.prices.find((price) => price.periodMonths === periodMonths) ?? null;
}

function resolvePlanMonthlyLabel(plan: BillingPlan) {
  const monthly = getPriceForPeriod(plan, 1);
  if (!monthly || monthly.priceKopeks <= 0) return "Бесплатно";
  return `${moneyRUBFromKopeks(monthly.priceKopeks)} /мес.`;
}

function formatPriceInput(priceKopeks: number) {
  const value = priceKopeks / 100;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "");
}

function buildPriceDraft(prices: BillingPlanPrice[]): Record<PeriodMonths, string> {
  const map = new Map<PeriodMonths, BillingPlanPrice>(
    prices.map((price) => [price.periodMonths, price])
  );
  return {
    1: formatPriceInput(map.get(1)?.priceKopeks ?? 0),
    3: formatPriceInput(map.get(3)?.priceKopeks ?? 0),
    6: formatPriceInput(map.get(6)?.priceKopeks ?? 0),
    12: formatPriceInput(map.get(12)?.priceKopeks ?? 0),
  };
}

function parsePriceInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function AdminBilling() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"main" | "features">("main");
  const [featureQuery, setFeatureQuery] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingPrices, setEditingPrices] = useState<Record<PeriodMonths, string>>(
    () => buildPriceDraft([])
  );
  const [editingSortOrder, setEditingSortOrder] = useState("");
  const [editingTier, setEditingTier] = useState<PlanTier>("FREE");
  const [editingScope, setEditingScope] = useState<SubscriptionScope>("MASTER");
  const [editingInheritsFromPlanId, setEditingInheritsFromPlanId] = useState<string | null>(null);
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [editingOverrides, setEditingOverrides] = useState<PlanFeatureOverrides>({});
  const [limitErrors, setLimitErrors] = useState<Record<string, string | null>>({});
  const modalRef = useRef<HTMLDivElement>(null);

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

  const closeModal = useCallback(() => {
    setModalMode(null);
    setActivePlanId(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modalMode) return;
    const container = modalRef.current;
    const firstField = container?.querySelector<HTMLInputElement>("input, select, textarea");
    if (firstField) {
      firstField.focus();
      if (typeof firstField.select === "function") firstField.select();
    }
  }, [modalMode]);

  useEffect(() => {
    if (!modalMode) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const container = modalRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modalMode, closeModal]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !modalMode) return;
    const keysCount = Object.keys(FEATURE_CATALOG).length;
    const entriesCount = Object.entries(FEATURE_CATALOG).length;
    if (keysCount !== entriesCount) {
      console.warn("[admin-billing] feature catalog mismatch", { keysCount, entriesCount });
    } else {
      console.debug("[admin-billing] feature catalog size", keysCount);
    }
  }, [modalMode]);

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const groupedPlans = useMemo(() => {
    const sorted = [...plans].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
      if (a.tier !== b.tier) return TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    const groups: Record<SubscriptionScope, BillingPlan[]> = { MASTER: [], STUDIO: [] };
    for (const plan of sorted) groups[plan.scope].push(plan);
    return groups;
  }, [plans]);

  const openCreate = () => {
    setModalMode("create");
    setActivePlanId(null);
    setActiveTab("main");
    setFeatureQuery("");
    setEditingCode("");
    setEditingName("");
    setEditingPrices(buildPriceDraft([]));
    setEditingSortOrder("0");
    setEditingTier("FREE");
    setEditingScope("MASTER");
    setEditingInheritsFromPlanId(null);
    setEditingIsActive(true);
    setEditingOverrides({});
    setLimitErrors({});
  };

  const openEdit = (plan: BillingPlan) => {
    setModalMode("edit");
    setActivePlanId(plan.id);
    setActiveTab("main");
    setFeatureQuery("");
    setEditingCode(plan.code);
    setEditingName(plan.name);
    setEditingPrices(buildPriceDraft(plan.prices));
    setEditingSortOrder(String(plan.sortOrder ?? 0));
    setEditingTier(plan.tier);
    setEditingScope(plan.scope);
    setEditingInheritsFromPlanId(plan.inheritsFromPlanId ?? null);
    setEditingIsActive(plan.isActive);
    setEditingOverrides(parseOverrides(plan.features));
    setLimitErrors({});
  };

  const draftPlanId = modalMode === "create" ? "__new__" : activePlanId;

  const draftPlansById = useMemo(() => {
    const map = buildPlanMap(plans);
    if (modalMode && draftPlanId) {
      map.set(draftPlanId, {
        id: draftPlanId,
        inheritsFromPlanId: editingInheritsFromPlanId ?? null,
        features: editingOverrides,
      });
    }
    return map;
  }, [plans, modalMode, draftPlanId, editingInheritsFromPlanId, editingOverrides]);

  const parentEffective = useMemo(() => {
    if (!editingInheritsFromPlanId) return undefined;
    return resolveEffectiveFeatures(editingInheritsFromPlanId, draftPlansById);
  }, [draftPlansById, editingInheritsFromPlanId]);

  const uiState = useMemo(() => {
    if (!draftPlanId) return null;
    return deriveUiState(draftPlanId, draftPlansById);
  }, [draftPlanId, draftPlansById]);

  const catalogEntries = useMemo(() => filterCatalog(editingScope), [editingScope]);

  const normalizedQuery = featureQuery.trim().toLowerCase();

  const filteredCatalogEntries = useMemo(() => {
    if (!normalizedQuery) return catalogEntries;
    return catalogEntries.filter(([key, def]) => {
      const haystack = `${def.title} ${def.description} ${def.group} ${key}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [catalogEntries, normalizedQuery]);

  const groupedCatalog = useMemo(() => groupCatalog(filteredCatalogEntries), [filteredCatalogEntries]);

  const validateLimitOverride = (key: LimitFeatureKey, nextValue: number | null) => {
    const parentValue = parentEffective ? parentEffective[key] : undefined;
    if (!isRelaxedLimit(parentValue, nextValue)) {
      setLimitErrors((current) => ({
        ...current,
        [key]: "Лимит нельзя сделать строже, чем у родительского тарифа.",
      }));
      return false;
    }
    setLimitErrors((current) => ({ ...current, [key]: null }));
    return true;
  };

  const updateOverride = (key: BooleanFeatureKey, checked: boolean) => {
    setEditingOverrides((current) => {
      const next = { ...current };
      if (checked) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const updateLimitOverride = (key: LimitFeatureKey, value: number | null | undefined) => {
    if (value === undefined) {
      setEditingOverrides((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setLimitErrors((current) => ({ ...current, [key]: null }));
      return;
    }
    if (!validateLimitOverride(key, value == null ? null : value)) return;
    setEditingOverrides((current) => ({ ...current, [key]: value }));
  };

  const savePlan = async () => {
    if (!modalMode) return;
    setSaving(true);
    setError(null);
    const sortOrderValue = Number(editingSortOrder);
    if (!Number.isFinite(sortOrderValue)) {
      setError("Укажите корректный порядок сортировки.");
      setSaving(false);
      return;
    }

    for (const key of Object.keys(limitErrors)) {
      if (limitErrors[key]) {
        setError("Исправьте ошибки лимитов.");
        setSaving(false);
        return;
      }
    }

    const parentValueMap = parentEffective ?? getDefaultPlanFeatures();
    for (const [key, value] of Object.entries(editingOverrides)) {
      if (!FEATURE_CATALOG[key as FeatureKey]) continue;
      if (FEATURE_CATALOG[key as FeatureKey].kind === "limit") {
        const parentLimit = parentEffective ? parentValueMap[key as LimitFeatureKey] : undefined;
        if (!isRelaxedLimit(parentLimit, value as number | null)) {
          setError("Лимит нельзя сделать строже, чем у родительского тарифа.");
          setSaving(false);
          return;
        }
      }
    }

    const pricesPayload = PERIODS.map((periodMonths) => {
      const priceKopeks = parsePriceInput(editingPrices[periodMonths] ?? "");
      if (priceKopeks === null) return null;
      return { periodMonths, priceKopeks };
    });

    if (pricesPayload.some((entry) => entry === null)) {
      setError("Укажите корректные цены для всех сроков.");
      setSaving(false);
      return;
    }

    try {
      const endpoint = "/api/admin/billing";
      const payload = {
        code: editingCode.trim(),
        name: editingName.trim(),
        prices: pricesPayload.filter(
          (entry): entry is { periodMonths: PeriodMonths; priceKopeks: number } => Boolean(entry)
        ),
        sortOrder: sortOrderValue,
        tier: editingTier,
        scope: editingScope,
        inheritsFromPlanId: editingInheritsFromPlanId,
        features: editingOverrides,
        isActive: editingIsActive,
      };

      const res = await fetch(endpoint, {
        method: modalMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalMode === "create" ? payload : { id: activePlanId, ...payload }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить тариф");
      }

      await load();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить тариф");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div>;
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">Тарифы и подписки</h1>
          <p className="mt-1 text-sm text-text-sec">
            Управляйте тарифами, функциями и наследованием между уровнями.
          </p>
        </div>
        <Button onClick={openCreate} variant="secondary">
          Создать тариф
        </Button>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {(["MASTER", "STUDIO"] as SubscriptionScope[]).map((scope) => (
        <section key={scope} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-main">
            {scope === "MASTER" ? "Тарифы для мастеров" : "Тарифы для студий"}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            {groupedPlans[scope].map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-text-main">{plan.name}</div>
                      <div className="mt-1 text-sm text-text-sec">{plan.code}</div>
                    </div>
                    <div className="text-sm font-semibold text-text-main">
                      {resolvePlanMonthlyLabel(plan)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3">
                  <div className="text-xs text-text-sec">
                    {TIER_LABEL[plan.tier]} • {PROVIDER_LABEL[plan.scope]} • Сортировка: {plan.sortOrder}
                  </div>
                  <div className="text-xs text-text-sec">Статус: {plan.isActive ? "Активен" : "Отключён"}</div>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(plan)}>
                    Редактировать
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <ModalSurface open={Boolean(modalMode)} onClose={closeModal} className="max-w-3xl p-0">
        <div ref={modalRef} className="flex max-h-[80dvh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border-subtle/60 px-6 py-4">
            <div>
              <h3 className="text-lg font-semibold text-text-main">
                {modalMode === "create" ? "Создание тарифа" : "Редактирование тарифа"}
              </h3>
              <p className="mt-1 text-xs text-text-sec">
                Настройте основные параметры и включите нужные функции ниже.
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Закрыть"
              className="rounded-full border border-border-subtle p-2 text-text-sec transition hover:text-text-main"
            >
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <Tabs
              items={MODAL_TABS}
              value={activeTab}
              onChange={(value) => setActiveTab(value as "main" | "features")}
              className="mb-5"
            />

            {activeTab === "main" ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-text-sec">
                    Код
                    <Input
                      value={editingCode}
                      onChange={(event) => setEditingCode(event.target.value)}
                      disabled={modalMode === "edit"}
                    />
                  </label>

                  <label className="text-xs text-text-sec">
                    Название
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      placeholder="Название тарифа"
                    />
                  </label>

                  <label className="text-xs text-text-sec">
                    Тип
                    <select
                      value={editingScope}
                      onChange={(event) => setEditingScope(event.target.value as SubscriptionScope)}
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm"
                    >
                      <option value="MASTER">Мастер</option>
                      <option value="STUDIO">Студия</option>
                    </select>
                  </label>

                  <label className="text-xs text-text-sec">
                    Уровень
                    <select
                      value={editingTier}
                      onChange={(event) => setEditingTier(event.target.value as PlanTier)}
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm"
                    >
                      <option value="FREE">Бесплатный</option>
                      <option value="PRO">PRO</option>
                      <option value="PREMIUM">Премиум</option>
                    </select>
                  </label>

                  <label className="text-xs text-text-sec sm:col-span-2">
                    Наследуется от
                    <select
                      value={editingInheritsFromPlanId ?? ""}
                      onChange={(event) => setEditingInheritsFromPlanId(event.target.value ? event.target.value : null)}
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {plans
                        .filter((plan) => plan.id !== activePlanId && plan.scope === editingScope)
                        .map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} ({plan.code})
                          </option>
                        ))}
                    </select>
                  </label>

                                    <div className="sm:col-span-2">
                    <div className="text-xs text-text-sec">Цены по периодам, ₽</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {PERIODS.map((periodMonths) => (
                        <label key={periodMonths} className="text-xs text-text-sec">
                          {periodMonths} мес.
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={editingPrices[periodMonths]}
                            onChange={(event) =>
                              setEditingPrices((current) => ({
                                ...current,
                                [periodMonths]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="text-xs text-text-sec">
                    Порядок сортировки
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={editingSortOrder}
                      onChange={(event) => setEditingSortOrder(event.target.value)}
                    />
                  </label>

                  <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm sm:col-span-2">
                    <div>
                      <div className="text-xs text-text-sec">Активен</div>
                      <div className="text-[11px] text-text-sec">
                        Тариф отображается и доступен для назначения/оплаты.
                      </div>
                    </div>
                    <Switch checked={editingIsActive} onCheckedChange={setEditingIsActive} />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "features" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    placeholder="Поиск функции..."
                    value={featureQuery}
                    onChange={(event) => setFeatureQuery(event.target.value)}
                    className="max-w-sm"
                  />
                  <div className="text-xs text-text-sec">Показано: {filteredCatalogEntries.length}</div>
                </div>

                {groupedCatalog.length === 0 ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-6 text-sm text-text-sec">
                    Ничего не найдено.
                  </div>
                ) : null}

                <div className="space-y-8">
                  {groupedCatalog.map(([groupName, entries], groupIndex) => (
                    <section
                      key={groupName}
                      className={cn("pt-2", groupIndex > 0 ? "border-t border-border-subtle/50" : "")}
                    >
                      <div className="sticky top-0 z-10 -mx-6 px-6 py-2 text-[11px] font-semibold uppercase tracking-widest text-text-sec/70 backdrop-blur">
                        {groupName}
                      </div>

                      <div className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-2">
                        {entries.map(([key, def]) => {
                          const state = uiState?.[key] as FeatureUiState | undefined;
                          if (!state) return null;

                          if (def.kind === "boolean") {
                            const isOverridden = state.isOverridden;
                            const isInherited = state.isInherited && state.effectiveValue === true;
                            const disabled = !canDisableFeature(key as BooleanFeatureKey, state);

                            const inheritedPlanCode = state.inheritedFromPlanId
                              ? plansById.get(state.inheritedFromPlanId)?.code ?? "BASE"
                              : "BASE";

                            const checked = Boolean(state.effectiveValue);

                            const toggleValue = () => {
                              if (disabled) return;
                              updateOverride(key as BooleanFeatureKey, !checked);
                            };

                            return (
                              <div
                                key={key}
                                role="button"
                                tabIndex={disabled ? -1 : 0}
                                onClick={toggleValue}
                                onKeyDown={(event) => {
                                  if (disabled) return;
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleValue();
                                  }
                                }}
                                className={cn(
                                  "flex items-start justify-between gap-4 rounded-lg px-3 py-3 transition-colors",
                                  disabled ? "opacity-90" : "cursor-pointer hover:bg-white/5"
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-text-main">{def.title}</div>
                                  {def.description ? (
                                    <div className="text-xs text-text-sec">{def.description}</div>
                                  ) : null}

                                  {isInherited ? (
                                    <div className="mt-1 text-[11px] text-text-sec">
                                      Унаследовано из: {inheritedPlanCode}
                                    </div>
                                  ) : null}

                                  {isInherited ? (
                                    <div className="text-[11px] text-text-sec">
                                      Нельзя отключить, т.к. включено в базовом тарифе.
                                    </div>
                                  ) : isOverridden ? (
                                    <div className="mt-1 text-[11px] text-text-sec">
                                      Переопределено для этого тарифа.
                                    </div>
                                  ) : null}
                                </div>

                                <div
                                  className="shrink-0"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  <Switch
                                    checked={checked}
                                    disabled={disabled}
                                    onCheckedChange={(value) => updateOverride(key as BooleanFeatureKey, value)}
                                  />
                                </div>
                              </div>
                            );
                          }

                          // limit
                          const overrideValue = editingOverrides[key as LimitFeatureKey];
                          const effectiveValue = state.effectiveValue as number | null;
                          const parentLimit = parentEffective ? parentEffective[key as LimitFeatureKey] : undefined;

                          const isUnlimited =
                            overrideValue === null || (overrideValue === undefined && effectiveValue === null);

                          const isLocked = parentLimit === null && overrideValue === undefined;

                          const inputValue =
                            overrideValue === null
                              ? ""
                              : overrideValue !== undefined
                                ? String(overrideValue)
                                : effectiveValue === null
                                  ? ""
                                  : String(effectiveValue);

                          const limitHint = isLocked
                            ? "Лимит унаследован, изменить нельзя."
                            : parentLimit !== undefined
                              ? "Лимит можно только ослаблять относительно родителя."
                              : null;

                          return (
                            <div
                              key={key}
                              className={cn(
                                "flex flex-col gap-3 rounded-lg px-3 py-3 md:col-span-2",
                                isLocked ? "opacity-90" : "hover:bg-white/5"
                              )}
                            >
                              <div>
                                <div className="text-sm font-medium text-text-main">{def.title}</div>
                                {def.description ? <div className="text-xs text-text-sec">{def.description}</div> : null}
                                {limitHint ? <div className="mt-1 text-[11px] text-text-sec">{limitHint}</div> : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={inputValue}
                                  disabled={isUnlimited || isLocked}
                                  onChange={(event) => {
                                    const raw = event.target.value;
                                    if (!raw) {
                                      updateLimitOverride(key as LimitFeatureKey, undefined);
                                      return;
                                    }
                                    const value = Number(raw);
                                    if (!Number.isFinite(value)) return;
                                    updateLimitOverride(key as LimitFeatureKey, value);
                                  }}
                                  className="w-28"
                                />

                                <div className="flex items-center gap-2 text-xs text-text-sec">
                                  <Switch
                                    checked={isUnlimited}
                                    disabled={isLocked}
                                    onCheckedChange={(checked) =>
                                      updateLimitOverride(key as LimitFeatureKey, checked ? null : undefined)
                                    }
                                  />
                                  <span>Безлимит</span>
                                </div>

                                {limitErrors[key as string] ? (
                                  <span className="text-xs text-rose-500">{limitErrors[key as string]}</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="shrink-0 border-t border-border-subtle/60 bg-bg-card/80 px-6 py-4 backdrop-blur">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void savePlan()} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </footer>
        </div>
      </ModalSurface>
    </section>
  );
}






