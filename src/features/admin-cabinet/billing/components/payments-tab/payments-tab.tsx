"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BillingPaymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { BillingTabEmpty } from "@/features/admin-cabinet/billing/components/billing-tab-empty";
import { PaymentTableRow } from "@/features/admin-cabinet/billing/components/payments-tab/payment-row";
import { RefundPaymentDialog } from "@/features/admin-cabinet/billing/components/payments-tab/refund-payment-dialog";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPaymentRow } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing;

type Toast = { kind: "success" | "error"; text: string } | null;

type Props = {
  pending: AdminPaymentRow[];
  history: AdminPaymentRow[];
  nextHistoryCursor: string | null;
};

/**
 * Payments tab orchestrator. Two grouped tables (pending + history),
 * shared refund dialog. Cursor pagination only applies to the history
 * group — pending is small and refreshed on each render.
 */
export function PaymentsTab({
  pending: initialPending,
  history: initialHistory,
  nextHistoryCursor,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [pending, setPending] = useState<AdminPaymentRow[]>(initialPending);
  const [history, setHistory] = useState<AdminPaymentRow[]>(initialHistory);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminPaymentRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const showToast = useCallback(
    (text: string, kind: "success" | "error" = "success") => {
      setToast({ kind, text });
      window.setTimeout(() => setToast(null), 2400);
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!nextHistoryCursor) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("payCursor", nextHistoryCursor);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }, [nextHistoryCursor, pathname, router, searchParams]);

  const handleRefund = async (reason: string) => {
    if (!target) return;
    setBusyId(target.id);
    try {
      const res = await fetch("/api/admin/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: target.id,
          reason: reason || undefined,
        }),
      });
      if (!res.ok) throw new Error("refund failed");
      // Optimistic — flip status to REFUNDED locally. Refund button
      // disappears because `isRefundable` recomputes false. Server
      // refresh will sync truth on next render.
      const updateRow = (row: AdminPaymentRow): AdminPaymentRow =>
        row.id === target.id
          ? { ...row, status: BillingPaymentStatus.REFUNDED, isRefundable: false }
          : row;
      setPending((prev) => prev.map(updateRow));
      setHistory((prev) => prev.map(updateRow));
      setTarget(null);
      showToast(T.toasts.paymentRefunded);
      router.refresh();
    } catch {
      showToast(T.toasts.refundError, "error");
    } finally {
      setBusyId(null);
    }
  };

  const hasAny =
    pending.length > 0 || history.length > 0 || !!nextHistoryCursor;

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        <BillingTabEmpty
          title={T.payments.empty.title}
          hint={T.payments.empty.hint}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-2xl border px-4 py-2.5 text-sm",
              toast.kind === "success"
                ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-red-300/40 bg-red-500/10 text-red-700 dark:text-red-300",
            )}
          >
            {toast.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PaymentsGroup
        title={T.payments.pendingHeader}
        rows={pending}
        emptyHint={T.payments.pendingEmpty}
        tone="warning"
        busyId={busyId}
        onRefund={setTarget}
      />

      <PaymentsGroup
        title={T.payments.historyHeader}
        rows={history}
        tone="default"
        busyId={busyId}
        onRefund={setTarget}
      />

      {nextHistoryCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="md" onClick={loadMore}>
            {T.payments.loadMore}
          </Button>
        </div>
      ) : null}

      <RefundPaymentDialog
        open={target !== null}
        payment={target}
        onClose={() => setTarget(null)}
        onConfirm={handleRefund}
      />
    </div>
  );
}

function PaymentsGroup({
  title,
  rows,
  emptyHint,
  tone,
  busyId,
  onRefund,
}: {
  title: string;
  rows: AdminPaymentRow[];
  emptyHint?: string;
  tone: "warning" | "default";
  busyId: string | null;
  onRefund: (row: AdminPaymentRow) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-text-sec">
        {title}
      </h3>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border shadow-card",
          tone === "warning"
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border-subtle bg-bg-card",
        )}
      >
        {rows.length === 0 && emptyHint ? (
          <p className="px-4 py-6 text-center text-sm text-text-sec">{emptyHint}</p>
        ) : rows.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wider text-text-sec">
                  <th className="px-4 py-3 font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.id}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.date}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.user}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.amount}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.status}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.method}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {UI_TEXT.adminPanel.billing.payments.columns.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row) => (
                  <PaymentTableRow
                    key={row.id}
                    payment={row}
                    busy={busyId === row.id}
                    onRefund={() => onRefund(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
