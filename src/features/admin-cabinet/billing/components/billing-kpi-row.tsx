import { BillingKpiCard } from "@/features/admin-cabinet/billing/components/billing-kpi-card";
import {
  formatRublesShort,
  formatRublesFromKopeks,
} from "@/features/admin-cabinet/billing/lib/kopeks";
import {
  toneForFailureRate,
  toneForPending,
  tonefromDelta,
} from "@/features/admin-cabinet/billing/lib/kpi-tone";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminBillingKpis } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing.kpi;

const COUNT_FMT = new Intl.NumberFormat("ru-RU");

type Props = {
  data: AdminBillingKpis;
};

export function BillingKpiRow({ data }: Props) {
  const mrrDelta =
    data.mrr.deltaPercent === null
      ? null
      : `${data.mrr.deltaPercent > 0 ? "+" : ""}${data.mrr.deltaPercent}% ${T.mrrSubtitle}`;

  const activeDelta =
    data.activeSubscriptions.deltaCount > 0
      ? `+${COUNT_FMT.format(data.activeSubscriptions.deltaCount)} ${T.activeSubsDelta}`
      : null;

  const pendingDelta =
    data.pendingPayments.count > 0
      ? `${T.pendingSubtitle}: ${formatRublesFromKopeks(data.pendingPayments.totalKopeks)}`
      : null;

  const failedDelta =
    data.failedLast7Days.percentOfAttempts === null
      ? null
      : `${data.failedLast7Days.percentOfAttempts}% ${T.failed7dSuffix}`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <BillingKpiCard
        label={T.mrr}
        value={formatRublesShort(data.mrr.valueKopeks)}
        delta={mrrDelta}
        tone={tonefromDelta(data.mrr.deltaPercent)}
      />
      <BillingKpiCard
        label={T.activeSubs}
        value={COUNT_FMT.format(data.activeSubscriptions.count)}
        delta={activeDelta}
        tone={data.activeSubscriptions.deltaCount > 0 ? "ok" : "neutral"}
      />
      <BillingKpiCard
        label={T.pending}
        value={COUNT_FMT.format(data.pendingPayments.count)}
        delta={pendingDelta}
        tone={toneForPending(data.pendingPayments.count)}
      />
      <BillingKpiCard
        label={T.failed7d}
        value={COUNT_FMT.format(data.failedLast7Days.count)}
        delta={failedDelta}
        tone={toneForFailureRate(data.failedLast7Days.percentOfAttempts)}
      />
    </div>
  );
}
