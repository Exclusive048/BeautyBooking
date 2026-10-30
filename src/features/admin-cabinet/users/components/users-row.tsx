"use client";

import { PlanTier } from "@/lib/prisma-enums";
import { Crown, Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/features/admin-cabinet/users/components/user-avatar";
import { UserPlanPill } from "@/features/admin-cabinet/users/components/user-plan-pill";
import { UserRoleBadge } from "@/features/admin-cabinet/users/components/user-role-badge";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminUserRow } from "@/features/admin-cabinet/users/types";
import { ViewerDate } from "@/components/ui/viewer-date";

const T = UI_TEXT.adminPanel.users;
const B = UI_TEXT.adminPanel.users.block;

type Props = {
  user: AdminUserRow;
  busy: boolean;
  onChangePlan: () => void;
  /** USER-BLOCKING-01 — показывать ли действие «Заблокировать / Разблокировать».
   * Скрыто там, где сервер всё равно откажет: свой аккаунт и администратор
   * для смотрящего без SUPERADMIN. */
  canManageAccess: boolean;
  onBlock: () => void;
  onUnblock: () => void;
};

/** Плашка «Заблокирован» + когда и за что. Причину видят только администраторы. */
function BlockedState({ user }: { user: AdminUserRow }) {
  if (!user.blockedAt) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <Badge size="xs" variant="danger">
        {B.badge}
      </Badge>
      <p className="line-clamp-2 text-xs text-text-sec" title={user.blockedReason ?? undefined}>
        <ViewerDate value={user.blockedAt} preset="dateTimeNumeric" />
        <span className="mx-1.5 text-text-sec/40" aria-hidden>
          ·
        </span>
        {user.blockedReason || B.reasonEmpty}
      </p>
    </div>
  );
}

function AccessAction({
  user,
  busy,
  onBlock,
  onUnblock,
}: Pick<Props, "user" | "busy" | "onBlock" | "onUnblock">) {
  if (user.blockedAt) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={onUnblock}
        disabled={busy}
        aria-label={B.unblockActionAria(user.displayName)}
      >
        <LockOpen className="mr-1.5 h-4 w-4" aria-hidden />
        {B.unblockAction}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onBlock}
      disabled={busy}
      aria-label={B.actionAria(user.displayName)}
      className="text-danger-text hover:bg-danger-surface"
    >
      <Lock className="mr-1.5 h-4 w-4" aria-hidden />
      {B.action}
    </Button>
  );
}

/** Mobile card variant — same data fields as the desktop row but in
 * div-based layout so it can live inside a `<ul>/<li>` stack instead
 * of a `<table>`. Renders alongside the table on `<md` viewports. */
export function UsersMobileCard({
  user,
  busy,
  onChangePlan,
  canManageAccess,
  onBlock,
  onUnblock,
}: Props) {
  const isPremium = user.plan?.tier === PlanTier.PREMIUM;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <UserAvatar userId={user.id} name={user.displayName} size={10} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-main">
            <span className="truncate">{user.displayName}</span>
            {isPremium ? (
              <Crown
                className="h-3 w-3 shrink-0 text-accent-text"
                aria-label={T.plan.tierPremium}
              />
            ) : null}
          </p>
          {user.email ? (
            <p className="truncate text-xs text-text-main">{user.email}</p>
          ) : null}
          {user.phone ? (
            <p className="truncate font-mono text-2xs text-text-sec">
              {user.phone}
            </p>
          ) : null}
          <BlockedState user={user} />
        </div>
        <UserRoleBadge role={user.primaryRole} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <UserPlanPill plan={user.plan} onClick={onChangePlan} disabled={busy} />
        <p className="font-mono text-2xs tabular-nums text-text-sec">
          {user.cityName ?? T.plan.empty}
          <span className="mx-1.5 text-text-sec/40" aria-hidden>
            ·
          </span>
          <ViewerDate value={user.createdAt} preset="dateTimeNumeric" />
        </p>
      </div>
      {canManageAccess ? (
        <div className="flex justify-end">
          <AccessAction user={user} busy={busy} onBlock={onBlock} onUnblock={onUnblock} />
        </div>
      ) : null}
    </div>
  );
}

export function UsersTableRow({
  user,
  busy,
  onChangePlan,
  canManageAccess,
  onBlock,
  onUnblock,
}: Props) {
  const isPremium = user.plan?.tier === PlanTier.PREMIUM;
  return (
    <tr className="hover:bg-bg-input/40">
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-3">
          <UserAvatar userId={user.id} name={user.displayName} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-text-main">
              <span className="truncate">{user.displayName}</span>
              {isPremium ? (
                <Crown
                  className="h-3 w-3 shrink-0 text-accent-text"
                  aria-label={T.plan.tierPremium}
                />
              ) : null}
            </p>
            <p className="mt-0.5 truncate font-mono text-3xs text-text-sec">
              #{user.id.slice(-8)}
            </p>
            <BlockedState user={user} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs">
        {user.email ? (
          <p className="truncate text-text-main">{user.email}</p>
        ) : null}
        {user.phone ? (
          <p className="mt-0.5 truncate font-mono text-text-sec">
            {user.phone}
          </p>
        ) : null}
        {!user.email && !user.phone ? (
          <span className="text-text-sec">{T.plan.empty}</span>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top">
        <UserRoleBadge role={user.primaryRole} />
      </td>
      <td className="px-4 py-3 align-top">
        <UserPlanPill plan={user.plan} onClick={onChangePlan} disabled={busy} />
      </td>
      <td className="px-4 py-3 align-top text-sm text-text-sec">
        {user.cityName ?? T.plan.empty}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-text-sec">
        <ViewerDate value={user.createdAt} preset="dateTimeNumeric" />
      </td>
      <td className="px-4 py-3 align-top text-right">
        {canManageAccess ? (
          <AccessAction user={user} busy={busy} onBlock={onBlock} onUnblock={onUnblock} />
        ) : null}
      </td>
    </tr>
  );
}
