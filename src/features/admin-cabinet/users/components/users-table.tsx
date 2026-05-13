"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UsersEmpty } from "@/features/admin-cabinet/users/components/users-empty";
import {
  UsersMobileCard,
  UsersTableRow,
} from "@/features/admin-cabinet/users/components/users-row";
import {
  PlanChangeDialog,
  type PlanChangeValue,
} from "@/features/admin-cabinet/users/components/plan-change-dialog";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminBillingPlanOption,
  AdminUserRow,
} from "@/features/admin-cabinet/users/types";

const T = UI_TEXT.adminPanel.users;

type Toast = { kind: "success" | "error"; text: string } | null;

type Props = {
  rows: AdminUserRow[];
  plans: AdminBillingPlanOption[];
  nextCursor: string | null;
};

/**
 * Client wrapper around the users table. Owns the plan-change dialog
 * state, optimistic plan updates on the row, and "load more" via
 * `?cursor=` URL state (matches the catalog pagination idiom).
 */
export function UsersTable({ rows: initialRows, plans, nextCursor }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<AdminUserRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  const [planTarget, setPlanTarget] = useState<AdminUserRow | null>(null);

  const showToast = useCallback(
    (text: string, kind: "success" | "error" = "success") => {
      setToast({ kind, text });
      window.setTimeout(() => setToast(null), 2400);
    },
    [],
  );

  const handlePlanChange = async (value: PlanChangeValue) => {
    if (!planTarget) return;
    setBusyId(planTarget.id);
    try {
      const res = await fetch(`/api/admin/users/${planTarget.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: value.planCode,
          periodMonths: value.periodMonths,
          reason: value.reason || undefined,
        }),
      });
      if (!res.ok) throw new Error("plan change failed");
      // Optimistic local update — full data comes back via refresh().
      setRows((prev) =>
        prev.map((r) =>
          r.id === planTarget.id && r.plan
            ? {
                ...r,
                plan: {
                  ...r.plan,
                  planCode: value.planCode,
                },
              }
            : r,
        ),
      );
      setPlanTarget(null);
      showToast(T.toasts.planChanged);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("cursor", nextCursor);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }, [nextCursor, pathname, router, searchParams]);

  return (
    <div className="space-y-3">
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

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wider text-text-sec">
                <th className="px-4 py-3 font-medium">{T.columns.user}</th>
                <th className="px-4 py-3 font-medium">{T.columns.contact}</th>
                <th className="px-4 py-3 font-medium">{T.columns.role}</th>
                <th className="px-4 py-3 font-medium">{T.columns.plan}</th>
                <th className="px-4 py-3 font-medium">{T.columns.city}</th>
                <th className="px-4 py-3 font-medium">{T.columns.created}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <UsersEmpty />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <UsersTableRow
                    key={row.id}
                    user={row}
                    busy={busyId === row.id}
                    onChangePlan={() => setPlanTarget(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: card stack — same data, restructured to flow
            vertically. We render the row twice (once as `<tr>`,
            once as a div-based card) instead of forcing a shared
            DOM shape — table semantics on desktop matter for
            screen-readers, but on mobile a card stack reads
            better. */}
        <ul className="divide-y divide-border-subtle md:hidden">
          {rows.length === 0 ? (
            <li>
              <UsersEmpty />
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="p-4">
                <UsersMobileCard
                  user={row}
                  busy={busyId === row.id}
                  onChangePlan={() => setPlanTarget(row)}
                />
              </li>
            ))
          )}
        </ul>
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="md" onClick={loadMore}>
            {T.pagination.loadMore}
          </Button>
        </div>
      ) : null}

      <PlanChangeDialog
        open={planTarget !== null}
        user={planTarget}
        plans={plans}
        onClose={() => setPlanTarget(null)}
        onSubmit={handlePlanChange}
      />
    </div>
  );
}
