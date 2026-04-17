"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
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
type SectionTab = "plans" | "subscriptions" | "payments";

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

type BillingResponse = { plans: BillingPlan[] };
type ModalMode = "create" | "edit";

type SubscriptionItem = {
  id: string;
  scope: "MASTER" | "STUDIO";
  status: string;
  periodMonths: number;
  autoRenew: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
  user: {
    id: string;
    displayName: string | null;
    phone: string | null;
    email: string | null;
  };
  plan: { id: string; name: string; code: string; tier: string };
};

type PaymentItem = {
  id: string;
  status: string;
  amountKopeks: number;
  yookassaPaymentId: string | null;
  createdAt: string;
  scope: string | null;
  planName: string | null;
  user: {
    id: string;
    displayName: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

const TIER_ORDER: Record<PlanTier, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };

const TIER_LABEL: Record<PlanTier, string> = {
  FREE: UI_TEXT.admin.billing.tier.free,
  PRO: UI_TEXT.admin.billing.tier.pro,
  PREMIUM: UI_TEXT.admin.billing.tier.premium,
};

const PROVIDER_LABEL: Record<SubscriptionScope, string> = {
  MASTER: UI_TEXT.admin.billing.scope.master,
  STUDIO: UI_TEXT.admin.billing.scope.studio,
};

const MODAL_TABS: TabItem[] = [
  { id: "main", label: UI_TEXT.admin.billing.tabs.main },
  { id: "features", label: UI_TEXT.admin.billing.tabs.features },
];

function buildPlanMap(plans: BillingPlan[]): Map<string, PlanNode> {
  return new Map(
    plans.map((plan) => [
      plan.id,
      { id: plan.id, inheritsFromPlanId: plan.inheritsFromPlanId, features: plan.features },
    ])
  );
}

function filterCatalog(
  scope: SubscriptionScope
): Array<[FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]> {
  return (Object.entries(FEATURE_CATALOG) as Array<[FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]]>)
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
  return plan.prices.find((p) => p.periodMonths === periodMonths) ?? null;
}

function resolvePlanMonthlyLabel(plan: BillingPlan) {
  const monthly = getPriceForPeriod(plan, 1);
  if (!monthly || monthly.priceKopeks <= 0) return UI_TEXT.admin.billing.freeMonthly;
  return `${moneyRUBFromKopeks(monthly.priceKopeks)} ${UI_TEXT.admin.billing.monthShort}`;
}

function formatPriceInput(priceKopeks: number) {
  const value = priceKopeks / 100;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "");
}

function buildPriceDraft(prices: BillingPlanPrice[]): Record<PeriodMonths, string> {
  const map = new Map<PeriodMonths, BillingPlanPrice>(prices.map((p) => [p.periodMonths, p]));
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

function formatDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function subStatusBadge(status: string) {
  const t = UI_TEXT.admin.billing.subscriptions.status;
  const label = t[status as keyof typeof t] ?? status;
  let cls = "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ";
  if (status === "ACTIVE") cls += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  else if (status === "PAST_DUE") cls += "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  else if (status === "CANCELLED") cls += "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  else if (status === "EXPIRED") cls += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  else cls += "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return <span className={cls}>{label}</span>;
}

function payStatusBadge(status: string) {
  const t = UI_TEXT.admin.billing.payments.status;
  const label = t[status as keyof typeof t] ?? status;
  let cls = "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ";
  if (status === "SUCCEEDED") cls += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  else if (status === "CANCELED") cls += "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  else if (status === "FAILED") cls += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  else if (status === "REFUNDED") cls += "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  else cls += "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return <span className={cls}>{label}</span>;
}

// ─── Subscriptions Panel ────────────────────────────────────────────────────

function SubscriptionsPanel() {
  const t = UI_TEXT.admin.billing;
  const ts = t.subscriptions;
  const viewerTimeZone = useViewerTimeZoneContext();

  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const buildUrl = (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    if (cursor) params.set("cursor", cursor);
    return `/api/admin/billing/subscriptions?${params.toString()}`;
  };

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const url = reset ? buildUrl() : buildUrl(nextCursor);
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{
          subscriptions: SubscriptionItem[];
          nextCursor: string | null;
        }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.errors.loadSubscriptions);
        }
        if (reset) setItems(json.data.subscriptions);
        else setItems((prev) => [...prev, ...json.data.subscriptions]);
        setNextCursor(json.data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errors.loadSubscriptions);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, nextCursor]
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">{t.sectionTabs.subscriptions}</option>
          {Object.keys(ts.status).map((s) => (
            <option key={s} value={s}>
              {ts.status[s as keyof typeof ts.status]}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{ts.table.user}</th>
                  <th className="px-4 py-3 text-left">{ts.table.plan}</th>
                  <th className="px-4 py-3 text-left">{ts.table.scope}</th>
                  <th className="px-4 py-3 text-left">{ts.table.status}</th>
                  <th className="px-4 py-3 text-left">{ts.table.periodEnd}</th>
                  <th className="px-4 py-3 text-left">{ts.table.autoRenew}</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? (
                  items.map((sub, i) => (
                    <tr key={sub.id} className={i % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">
                        <div>{sub.user.displayName || "—"}</div>
                        <div className="text-xs text-text-sec tabular-nums">{sub.user.phone || sub.user.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {sub.plan.name}
                        <div className="text-xs text-text-sec/70">{sub.plan.code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {PROVIDER_LABEL[sub.scope]}
                      </td>
                      <td className="px-4 py-3">{subStatusBadge(sub.status)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-sec">
                        {sub.currentPeriodEnd
                          ? formatDate(sub.currentPeriodEnd, viewerTimeZone)
                          : ts.noEnd}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {sub.autoRenew ? ts.autoRenewYes : ts.autoRenewNo}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-sec">
                      {ts.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="border-t border-border-subtle/60 px-4 py-3">
              <Button variant="secondary" size="sm" onClick={() => void load(false)} disabled={loadingMore}>
                {loadingMore ? ts.loadingMore : ts.loadMore}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Payments Panel ─────────────────────────────────────────────────────────

function PaymentsPanel() {
  const t = UI_TEXT.admin.billing;
  const tp = t.payments;
  const viewerTimeZone = useViewerTimeZoneContext();

  const [items, setItems] = useState<PaymentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundedIds, setRefundedIds] = useState<Set<string>>(new Set());

  const buildUrl = (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    if (cursor) params.set("cursor", cursor);
    return `/api/admin/billing/payments?${params.toString()}`;
  };

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const url = reset ? buildUrl() : buildUrl(nextCursor);
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{
          payments: PaymentItem[];
          nextCursor: string | null;
        }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.errors.loadPayments);
        }
        if (reset) setItems(json.data.payments);
        else setItems((prev) => [...prev, ...json.data.payments]);
        setNextCursor(json.data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errors.loadPayments);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, nextCursor]
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const refund = async (paymentId: string) => {
    setRefundingId(paymentId);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.refund);
      }
      setRefundedIds((prev) => new Set([...prev, paymentId]));
      setItems((prev) =>
        prev.map((item) => (item.id === paymentId ? { ...item, status: "REFUNDED" } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.refund);
    } finally {
      setRefundingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">{t.sectionTabs.payments}</option>
          {Object.keys(tp.status).map((s) => (
            <option key={s} value={s}>
              {tp.status[s as keyof typeof tp.status]}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{tp.table.user}</th>
                  <th className="px-4 py-3 text-left">{tp.table.plan}</th>
                  <th className="px-4 py-3 text-left">{tp.table.amount}</th>
                  <th className="px-4 py-3 text-left">{tp.table.status}</th>
                  <th className="px-4 py-3 text-left">{tp.table.date}</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? (
                  items.map((pay, i) => (
                    <tr key={pay.id} className={i % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">
                        <div>{pay.user?.displayName || "—"}</div>
                        <div className="text-xs text-text-sec tabular-nums">
                          {pay.user?.phone || pay.user?.email || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {pay.planName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-main">
                        {moneyRUBFromKopeks(pay.amountKopeks)}
                      </td>
                      <td className="px-4 py-3">{payStatusBadge(pay.status)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-sec">
                        {formatDate(pay.createdAt, viewerTimeZone)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pay.status === "SUCCEEDED" && !refundedIds.has(pay.id) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={refundingId === pay.id}
                            onClick={() => void refund(pay.id)}
                          >
                            {refundingId === pay.id ? UI_TEXT.status.saving : tp.refund}
                          </Button>
                        ) : refundedIds.has(pay.id) ? (
                          <span className="text-xs text-text-sec">{tp.refundDone}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-sec">
                      {tp.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="border-t border-border-subtle/60 px-4 py-3">
              <Button variant="secondary" size="sm" onClick={() => void load(false)} disabled={loadingMore}>
                {loadingMore ? tp.loadingMore : tp.loadMore}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminBilling() {
  const t = UI_TEXT.admin.billing;

  const [section, setSection] = useState<SectionTab>("plans");

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

  const SECTION_TABS: TabItem[] = useMemo(
    () => [
      { id: "plans", label: t.sectionTabs.plans },
      { id: "subscriptions", label: t.sectionTabs.subscriptions },
      { id: "payments", label: t.sectionTabs.payments },
    ],
    [t.sectionTabs]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<BillingResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.loadPlans);
      }
      setPlans(json.data.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.loadPlans);
    } finally {
      setLoading(false);
    }
  }, [t.errors.loadPlans]);

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
      setLimitErrors((current) => ({ ...current, [key]: t.errors.strictLimit }));
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
      setError(t.errors.invalidSortOrder);
      setSaving(false);
      return;
    }
    for (const key of Object.keys(limitErrors)) {
      if (limitErrors[key]) {
        setError(t.errors.limitValidation);
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
          setError(t.errors.strictLimit);
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
      setError(t.errors.invalidPrices);
      setSaving(false);
      return;
    }
    try {
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
      const res = await fetch("/api/admin/billing", {
        method: modalMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalMode === "create" ? payload : { id: activePlanId, ...payload }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.savePlan);
      }
      await load();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.savePlan);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
          <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
        </div>
        {section === "plans" ? (
          <Button onClick={openCreate} variant="secondary">
            {t.createPlan}
          </Button>
        ) : null}
      </header>

      <Tabs
        items={SECTION_TABS}
        value={section}
        onChange={(v) => setSection(v as SectionTab)}
      />

      {error && section === "plans" ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {section === "plans" ? (
        loading ? (
          <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
        ) : (
          <>
            {(["MASTER", "STUDIO"] as SubscriptionScope[]).map((scope) => (
              <section key={scope} className="space-y-4">
                <h2 className="text-lg font-semibold text-text-main">
                  {scope === "MASTER" ? t.plansForMaster : t.plansForStudio}
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
                          {TIER_LABEL[plan.tier]} • {PROVIDER_LABEL[plan.scope]} •{" "}
                          {t.sortOrderLabel}: {plan.sortOrder}
                        </div>
                        <div className="text-xs text-text-sec">
                          {t.statusLabel}: {plan.isActive ? t.statusActive : t.statusDisabled}
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(plan)}>
                          {t.edit}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </>
        )
      ) : section === "subscriptions" ? (
        <SubscriptionsPanel />
      ) : (
        <PaymentsPanel />
      )}

      <ModalSurface open={Boolean(modalMode)} onClose={closeModal} className="max-w-3xl p-0">
        <div ref={modalRef} className="flex max-h-[80dvh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border-subtle/60 px-6 py-4">
            <div>
              <h3 className="text-lg font-semibold text-text-main">
                {modalMode === "create" ? t.modalCreateTitle : t.modalEditTitle}
              </h3>
              <p className="mt-1 text-xs text-text-sec">{t.modalSubtitle}</p>
            </div>
            <Button variant="icon" size="icon" onClick={closeModal} aria-label={t.closeAria}>
              ×
            </Button>
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
                    {t.fields.code}
                    <Input
                      value={editingCode}
                      onChange={(event) => setEditingCode(event.target.value)}
                      disabled={modalMode === "edit"}
                    />
                  </label>

                  <label className="text-xs text-text-sec">
                    {t.fields.name}
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      placeholder={t.fields.namePlaceholder}
                    />
                  </label>

                  <label className="text-xs text-text-sec">
                    {t.fields.type}
                    <Select
                      value={editingScope}
                      onChange={(event) => setEditingScope(event.target.value as SubscriptionScope)}
                      className="mt-1"
                    >
                      <option value="MASTER">{t.scope.master}</option>
                      <option value="STUDIO">{t.scope.studio}</option>
                    </Select>
                  </label>

                  <label className="text-xs text-text-sec">
                    {t.fields.level}
                    <Select
                      value={editingTier}
                      onChange={(event) => setEditingTier(event.target.value as PlanTier)}
                      className="mt-1"
                    >
                      <option value="FREE">{t.tier.free}</option>
                      <option value="PRO">PRO</option>
                      <option value="PREMIUM">{t.tier.premium}</option>
                    </Select>
                  </label>

                  <label className="text-xs text-text-sec sm:col-span-2">
                    {t.fields.inheritsFrom}
                    <Select
                      value={editingInheritsFromPlanId ?? ""}
                      onChange={(event) =>
                        setEditingInheritsFromPlanId(event.target.value ? event.target.value : null)
                      }
                      className="mt-1"
                    >
                      <option value="">{t.fields.noParent}</option>
                      {plans
                        .filter((plan) => plan.id !== activePlanId && plan.scope === editingScope)
                        .map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} ({plan.code})
                          </option>
                        ))}
                    </Select>
                  </label>

                  <div className="sm:col-span-2">
                    <div className="text-xs text-text-sec">{t.fields.pricesByPeriod}</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {PERIODS.map((periodMonths) => (
                        <label key={periodMonths} className="text-xs text-text-sec">
                          {t.fields.periodMonths(periodMonths)}
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
                    {t.fields.sortOrder}
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
                      <div className="text-xs text-text-sec">{t.fields.active}</div>
                      <div className="text-[11px] text-text-sec">{t.fields.activeHint}</div>
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
                    placeholder={t.featureSearchPlaceholder}
                    value={featureQuery}
                    onChange={(event) => setFeatureQuery(event.target.value)}
                    className="max-w-sm"
                  />
                  <div className="text-xs text-text-sec">
                    {t.shownCount(filteredCatalogEntries.length)}
                  </div>
                </div>

                {groupedCatalog.length === 0 ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-6 text-sm text-text-sec">
                    {t.nothingFound}
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
                                      {t.inheritedFrom(inheritedPlanCode)}
                                    </div>
                                  ) : null}
                                  {isInherited ? (
                                    <div className="text-[11px] text-text-sec">
                                      {t.cannotDisableInherited}
                                    </div>
                                  ) : isOverridden ? (
                                    <div className="mt-1 text-[11px] text-text-sec">
                                      {t.overriddenForPlan}
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
                                    onCheckedChange={(value) =>
                                      updateOverride(key as BooleanFeatureKey, value)
                                    }
                                  />
                                </div>
                              </div>
                            );
                          }

                          // limit
                          const overrideValue = editingOverrides[key as LimitFeatureKey];
                          const effectiveValue = state.effectiveValue as number | null;
                          const parentLimit = parentEffective
                            ? parentEffective[key as LimitFeatureKey]
                            : undefined;

                          const isUnlimited =
                            overrideValue === null ||
                            (overrideValue === undefined && effectiveValue === null);
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
                            ? t.limitInheritedLocked
                            : parentLimit !== undefined
                              ? t.limitOnlyRelaxParent
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
                                {def.description ? (
                                  <div className="text-xs text-text-sec">{def.description}</div>
                                ) : null}
                                {limitHint ? (
                                  <div className="mt-1 text-[11px] text-text-sec">{limitHint}</div>
                                ) : null}
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
                                      updateLimitOverride(
                                        key as LimitFeatureKey,
                                        checked ? null : undefined
                                      )
                                    }
                                  />
                                  <span>{t.unlimited}</span>
                                </div>
                                {limitErrors[key as string] ? (
                                  <span className="text-xs text-red-600 dark:text-red-400">
                                    {limitErrors[key as string]}
                                  </span>
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
                {UI_TEXT.actions.cancel}
              </Button>
              <Button type="button" onClick={() => void savePlan()} disabled={saving}>
                {saving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
              </Button>
            </div>
          </footer>
        </div>
      </ModalSurface>
    </section>
  );
}
