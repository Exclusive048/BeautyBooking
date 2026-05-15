import type {
  BillingPaymentStatus,
  PlanTier,
  SubscriptionScope,
  SubscriptionStatus,
} from "@prisma/client";

/** Which tab is currently active on `/admin/billing`. URL-driven —
 * matches the value of `?tab=...`. */
export type AdminBillingTab = "plans" | "subs" | "payments";

/** UI-side tone hint for KPI cards. `neutral` = no data, render «—». */
export type AdminBillingKpiTone = "ok" | "warn" | "danger" | "neutral";

export type AdminBillingKpis = {
  mrr: {
    valueKopeks: number;
    /** Percent change vs the previous calendar month. `null` when no
     * historical snapshot exists yet — UI renders «—». */
    deltaPercent: number | null;
  };
  activeSubscriptions: {
    count: number;
    /** Newly-activated paid subscriptions in the last 30 days. */
    deltaCount: number;
  };
  pendingPayments: {
    count: number;
    totalKopeks: number;
  };
  failedLast7Days: {
    count: number;
    /** `failed / (failed + succeeded)` over the same 7-day window.
     * Range 0–100. `null` when no attempts (no denominator). */
    percentOfAttempts: number | null;
  };
};

export type AdminPlanPrice = {
  periodMonths: 1 | 3 | 6 | 12;
  priceKopeks: number;
  isActive: boolean;
};

export type AdminPlanFeatureLine = {
  /** Short label rendered next to the check icon ("Онлайн-запись"). */
  title: string;
  /** Limit features include the resolved numeric value
   * ("Бронирований в день: 50"). */
  detail: string | null;
};

export type AdminPlanCard = {
  id: string;
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  features: AdminPlanFeatureLine[];
  /** Raw `BillingPlan.features` Json — the overrides this plan
   * stores in DB. Pre-typed as the catalog-respecting shape so the
   * features editor (ADMIN-BILLING-FIX-B) can edit without an extra
   * fetch. UI cards use the rendered `features` array above. */
  rawFeatures: import("@/lib/billing/features").PlanFeatureOverrides;
  /** Parent plan id (cuid) — the editor needs this to render the
   * inheritance select and resolve `parentEffective` features. */
  inheritsFromPlanId: string | null;
  prices: AdminPlanPrice[];
  /** Per-month equivalent — when there is a 1-month price we use it
   * directly; otherwise we derive from the cheapest period. Display-
   * only field (kopeks). */
  primaryPricePerMonthKopeks: number;
  activeSubscriptionsCount: number;
  isFeatured: boolean;
  sortOrder: number;
  isActive: boolean;
};

/** Minimal shape passed to the features editor for inheritance
 * resolution — only what `resolveEffectiveFeatures` / `deriveUiState`
 * need from sibling plans. Keeps the props bundle small. */
export type AdminPlanInheritanceCandidate = {
  id: string;
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  inheritsFromPlanId: string | null;
  rawFeatures: import("@/lib/billing/features").PlanFeatureOverrides;
};

export type AdminSubscriptionRow = {
  id: string;
  user: {
    id: string;
    displayName: string;
  };
  plan: {
    code: string;
    name: string;
    tier: PlanTier;
    scope: SubscriptionScope;
  };
  periodMonths: number;
  /** Subscription's lifecycle status. */
  status: SubscriptionStatus;
  /** Sum that will be charged at the next renewal (price for the
   * period the subscription was bought with, in kopeks). Falls back
   * to 0 when `BillingPlanPrice` is missing — UI renders «—». */
  amountKopeks: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  isTrial: boolean;
  /** Derived from the most recent succeeded `BillingPayment.metadata` /
   * provider hint. `null` when no payment method has been captured
   * for this subscription yet (admin gifts, fresh trials). */
  paymentMethodDisplay: string | null;
};

export type AdminPaymentRow = {
  id: string;
  /** Short display form — last 8 chars of cuid, e.g. "PAY-abc12345". */
  displayId: string;
  user: {
    id: string;
    displayName: string;
  } | null;
  amountKopeks: number;
  status: BillingPaymentStatus;
  createdAt: string;
  /** Derived from `metadata.payment_method.title` when present;
   * `null` when the YooKassa response didn't carry one (PENDING
   * before first poll, manual admin entries, etc.). */
  paymentMethodDisplay: string | null;
  subscriptionId: string;
  yookassaPaymentId: string | null;
  /** Only `SUCCEEDED` payments with a YooKassa id are refundable —
   * the refund endpoint forwards to YooKassa, which can't refund
   * what it didn't process. */
  isRefundable: boolean;
};
