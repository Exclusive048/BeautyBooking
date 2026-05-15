import { SubscriptionsTable } from "@/features/admin-cabinet/billing/components/subscriptions-tab/subscriptions-table";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";

type Props = {
  rows: AdminSubscriptionRow[];
  nextCursor: string | null;
};

export function SubscriptionsTab({ rows, nextCursor }: Props) {
  return <SubscriptionsTable rows={rows} nextCursor={nextCursor} />;
}
