import { BillingHeader } from "@/features/admin-cabinet/billing/components/billing-header";
import { BillingKpiRow } from "@/features/admin-cabinet/billing/components/billing-kpi-row";
import { BillingTabs } from "@/features/admin-cabinet/billing/components/billing-tabs";
import { PaymentsTab } from "@/features/admin-cabinet/billing/components/payments-tab/payments-tab";
import { PlansGrid } from "@/features/admin-cabinet/billing/components/plans-grid";
import { SubscriptionsTab } from "@/features/admin-cabinet/billing/components/subscriptions-tab/subscriptions-tab";
import type {
  AdminBillingKpis,
  AdminBillingTab,
  AdminPaymentRow,
  AdminPlanCard,
  AdminPlanInheritanceCandidate,
  AdminSubscriptionRow,
} from "@/features/admin-cabinet/billing/types";

type Props = {
  activeTab: AdminBillingTab;
  kpis: AdminBillingKpis;
  plans: AdminPlanCard[];
  /** Light shape of every plan — used by the features editor's
   * inheritance select. Loaded once at SSR. */
  candidates: AdminPlanInheritanceCandidate[];
  subscriptions: {
    rows: AdminSubscriptionRow[];
    nextCursor: string | null;
  };
  payments: {
    pending: AdminPaymentRow[];
    history: AdminPaymentRow[];
    nextHistoryCursor: string | null;
  };
};

/**
 * Server orchestrator for `/admin/billing`. Layout: caption → 4 KPI
 * tiles → 3-tab strip → active tab content.
 *
 * The orchestrator always fetches data for all three tabs upfront —
 * the page is server-rendered per request and there's no client
 * round-trip when switching tabs. KPI row is shared across tabs by
 * design (financial overview should always be visible).
 */
export function AdminBilling({
  activeTab,
  kpis,
  plans,
  candidates,
  subscriptions,
  payments,
}: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <BillingHeader />
      <BillingKpiRow data={kpis} />
      <BillingTabs active={activeTab} />
      {activeTab === "plans" ? (
        <PlansGrid plans={plans} candidates={candidates} />
      ) : null}
      {activeTab === "subs" ? (
        <SubscriptionsTab
          rows={subscriptions.rows}
          nextCursor={subscriptions.nextCursor}
        />
      ) : null}
      {activeTab === "payments" ? (
        <PaymentsTab
          pending={payments.pending}
          history={payments.history}
          nextHistoryCursor={payments.nextHistoryCursor}
        />
      ) : null}
    </div>
  );
}
