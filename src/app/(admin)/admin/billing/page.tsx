import { AdminBilling } from "@/features/admin-cabinet/billing/components/admin-billing";
import { getAdminBillingKpis } from "@/features/admin-cabinet/billing/server/kpis.service";
import { listAdminPayments } from "@/features/admin-cabinet/billing/server/payments.service";
import {
  listAdminPlans,
  listInheritanceCandidates,
} from "@/features/admin-cabinet/billing/server/plans.service";
import { listAdminSubscriptions } from "@/features/admin-cabinet/billing/server/subscriptions.service";
import type { AdminBillingTab } from "@/features/admin-cabinet/billing/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  tab?: string;
  subCursor?: string;
  payCursor?: string;
}>;

function parseTab(value: string | undefined): AdminBillingTab {
  if (value === "subs" || value === "payments" || value === "plans") return value;
  return "plans";
}

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const activeTab = parseTab(params.tab);
  const subCursor = params.subCursor?.trim() || null;
  const payCursor = params.payCursor?.trim() || null;

  // Always fetch KPIs (shared across tabs). Plans/subs/payments
  // fetched in parallel — the request budget is dominated by the
  // slowest, which is fine for an admin SSR page.
  const [kpis, plans, candidates, subscriptions, payments] = await Promise.all([
    getAdminBillingKpis(),
    listAdminPlans(),
    listInheritanceCandidates(),
    listAdminSubscriptions({ cursor: subCursor }),
    listAdminPayments({ historyCursor: payCursor }),
  ]);

  return (
    <AdminBilling
      activeTab={activeTab}
      kpis={kpis}
      plans={plans}
      candidates={candidates}
      subscriptions={{
        rows: subscriptions.items,
        nextCursor: subscriptions.nextCursor,
      }}
      payments={payments}
    />
  );
}
