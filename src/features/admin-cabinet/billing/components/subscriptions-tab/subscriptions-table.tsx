"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BillingTabEmpty } from "@/features/admin-cabinet/billing/components/billing-tab-empty";
import { CancelSubscriptionDialog } from "@/features/admin-cabinet/billing/components/subscriptions-tab/cancel-subscription-dialog";
import { SubscriptionsTableRow } from "@/features/admin-cabinet/billing/components/subscriptions-tab/subscriptions-row";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";
import { useToast } from "@/components/ui/toast";

const T = UI_TEXT.adminPanel.billing;

type Props = {
  rows: AdminSubscriptionRow[];
  nextCursor: string | null;
};

/**
 * Subscriptions table client wrapper. Owns:
 *   - cancel-dialog state (one shared dialog instance)
 *   - optimistic row hide after successful cancel
 *   - toast for feedback
 *   - cursor pagination via `?subCursor=` URL state
 *
 * Two pagination URL keys (`subCursor`, `payCursor`) means switching
 * tabs preserves the other tab's page without clobbering it.
 */
export function SubscriptionsTable({ rows: initialRows, nextCursor }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<AdminSubscriptionRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminSubscriptionRow | null>(null);
  const toast = useToast();

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("subCursor", nextCursor);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }, [nextCursor, pathname, router, searchParams]);

  const handleConfirm = async (reason: string) => {
    if (!target) return;
    setBusyId(target.id);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/admin/billing/subscriptions/${target.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || undefined }),
        },
      );
      // Optimistic — local hide. server refresh syncs definitive
      // state (status field, etc) on next render.
      setRows((prev) => prev.filter((r) => r.id !== target.id));
      setTarget(null);
      toast.success(T.toasts.subscriptionCancelled);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.cancelError));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0 && !nextCursor) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        <BillingTabEmpty title={T.subs.empty.title} hint={T.subs.empty.hint} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-2xs uppercase tracking-wider text-text-sec">
                <th className="px-4 py-3 font-medium">{T.subs.columns.user}</th>
                <th className="px-4 py-3 font-medium">{T.subs.columns.plan}</th>
                <th className="px-4 py-3 font-medium">{T.subs.columns.since}</th>
                <th className="px-4 py-3 font-medium">{T.subs.columns.next}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.subs.columns.amount}
                </th>
                <th className="px-4 py-3 font-medium">{T.subs.columns.method}</th>
                <th className="px-4 py-3 font-medium">{T.subs.columns.autoRenew}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.subs.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <SubscriptionsTableRow
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onCancel={() => setTarget(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="md" onClick={loadMore}>
            {T.subs.loadMore}
          </Button>
        </div>
      ) : null}

      <CancelSubscriptionDialog
        open={target !== null}
        subscription={target}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
