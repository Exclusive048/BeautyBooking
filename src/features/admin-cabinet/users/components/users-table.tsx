"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { BlockUserDialog } from "@/features/admin-cabinet/users/components/block-user-dialog";
import { useCursorPagedRows } from "@/features/admin-cabinet/lib/server-rows";
import { useConfirm } from "@/hooks/use-confirm";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { AccountType } from "@/lib/prisma-enums";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminBillingPlanOption,
  AdminUserRow,
  AdminUsersViewer,
} from "@/features/admin-cabinet/users/types";
import { useToast } from "@/components/ui/toast";

const T = UI_TEXT.adminPanel.users;

type Props = {
  rows: AdminUserRow[];
  plans: AdminBillingPlanOption[];
  nextCursor: string | null;
  viewer: AdminUsersViewer;
};

type BlockStateResponse = {
  user: { userId: string; blockedAt: string | null; blockedReason: string | null };
};

/**
 * USER-BLOCKING-01 — показывать ли действие над доступом. Правило то же,
 * что у сервера (`block.service.ts`), но только его видимая часть: свой
 * аккаунт и администратор без SUPERADMIN. Постоянного админа клиент не
 * распознаёт (подтверждённость почты в строку не приходит) — там откажет
 * сервер, и тост покажет его строку.
 */
function canManageAccess(viewer: AdminUsersViewer, row: AdminUserRow): boolean {
  if (viewer.id === null || row.id === viewer.id) return false;
  const isAdmin = row.roles.some(
    (role) => role === AccountType.ADMIN || role === AccountType.SUPERADMIN,
  );
  return !isAdmin || viewer.canManageAdmins;
}

/**
 * Client wrapper around the users table. Owns the plan-change dialog
 * state, optimistic plan updates on the row, and "load more" via
 * `?cursor=` URL state (matches the catalog pagination idiom).
 */
export function UsersTable({ rows: initialRows, plans, nextCursor, viewer }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // UX-PASS-01: строки — из ответа сервера; «Загрузить ещё» дописывает
  // страницу, смена роли / тарифа / поиска начинает список заново.
  const [rows, setRows] = useCursorPagedRows<AdminUserRow>(initialRows, {
    cursor: searchParams?.get("cursor") ?? null,
    resetKey: ["role", "plan", "status", "q"].map((key) => searchParams?.get(key) ?? "").join("|"),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [planTarget, setPlanTarget] = useState<AdminUserRow | null>(null);
  const [blockTarget, setBlockTarget] = useState<AdminUserRow | null>(null);
  const { confirm, modal: confirmModal } = useConfirm();

  const applyBlockState = (state: BlockStateResponse["user"]) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === state.userId
          ? { ...r, blockedAt: state.blockedAt, blockedReason: state.blockedReason }
          : r,
      ),
    );
  };

  /** Отказ бросается дальше — окно блокировки показывает его у себя. */
  const handleBlock = async (reason: string) => {
    if (!blockTarget) return;
    setBusyId(blockTarget.id);
    try {
      const data = await fetchJsonWithAuth<BlockStateResponse>(
        `/api/admin/users/${blockTarget.id}/block`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      applyBlockState(data.user);
      setBlockTarget(null);
      toast.success(T.toasts.blocked);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleUnblock = async (row: AdminUserRow) => {
    const confirmed = await confirm({
      title: T.block.unblockConfirm.title,
      message: T.block.unblockConfirm.message(row.displayName),
      confirmLabel: T.block.unblockConfirm.confirm,
    });
    if (!confirmed) return;
    setBusyId(row.id);
    try {
      const data = await fetchJsonWithAuth<BlockStateResponse>(
        `/api/admin/users/${row.id}/unblock`,
        { method: "POST" },
      );
      applyBlockState(data.user);
      toast.success(T.toasts.unblocked);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.unblockFailed));
    } finally {
      setBusyId(null);
    }
  };

  const handlePlanChange = async (value: PlanChangeValue) => {
    if (!planTarget) return;
    setBusyId(planTarget.id);
    try {
      await fetchJsonWithAuth<unknown>(`/api/admin/users/${planTarget.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: value.planCode,
          periodMonths: value.periodMonths,
          reason: value.reason || undefined,
        }),
      });
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
      toast.success(T.toasts.planChanged);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.errorGeneric));
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
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        {/* UX-PASS-01: на планшете и узком окне семь колонок не помещаются —
            таблица прокручивается внутри карточки, а не обрезается краем. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-2xs uppercase tracking-wider text-text-sec">
                <th className="px-4 py-3 font-medium">{T.columns.user}</th>
                <th className="px-4 py-3 font-medium">{T.columns.contact}</th>
                <th className="px-4 py-3 font-medium">{T.columns.role}</th>
                <th className="px-4 py-3 font-medium">{T.columns.plan}</th>
                <th className="px-4 py-3 font-medium">{T.columns.city}</th>
                <th className="px-4 py-3 font-medium">{T.columns.created}</th>
                <th className="px-4 py-3 text-right font-medium">{T.columns.access}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
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
                    canManageAccess={canManageAccess(viewer, row)}
                    onBlock={() => setBlockTarget(row)}
                    onUnblock={() => void handleUnblock(row)}
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
                  canManageAccess={canManageAccess(viewer, row)}
                  onBlock={() => setBlockTarget(row)}
                  onUnblock={() => void handleUnblock(row)}
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

      {blockTarget ? (
        <BlockUserDialog
          key={blockTarget.id}
          user={blockTarget}
          onClose={() => setBlockTarget(null)}
          onSubmit={handleBlock}
        />
      ) : null}
      {confirmModal}
    </div>
  );
}
