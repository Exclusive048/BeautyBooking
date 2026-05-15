"use client";

import { PlanTier } from "@prisma/client";
import { Crown } from "lucide-react";
import { UserAvatar } from "@/features/admin-cabinet/users/components/user-avatar";
import { UserPlanPill } from "@/features/admin-cabinet/users/components/user-plan-pill";
import { UserRoleBadge } from "@/features/admin-cabinet/users/components/user-role-badge";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminUserRow } from "@/features/admin-cabinet/users/types";

const T = UI_TEXT.adminPanel.users;

const MONTH_YEAR = new Intl.DateTimeFormat("ru-RU", {
  month: "short",
  year: "numeric",
});

type Props = {
  user: AdminUserRow;
  busy: boolean;
  onChangePlan: () => void;
};

/** Mobile card variant — same data fields as the desktop row but in
 * div-based layout so it can live inside a `<ul>/<li>` stack instead
 * of a `<table>`. Renders alongside the table on `<md` viewports. */
export function UsersMobileCard({ user, busy, onChangePlan }: Props) {
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
                className="h-3 w-3 shrink-0 text-primary"
                aria-label={T.plan.tierPremium}
              />
            ) : null}
          </p>
          {user.email ? (
            <p className="truncate text-xs text-text-main">{user.email}</p>
          ) : null}
          {user.phone ? (
            <p className="truncate font-mono text-[11px] text-text-sec">
              {user.phone}
            </p>
          ) : null}
        </div>
        <UserRoleBadge role={user.primaryRole} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <UserPlanPill plan={user.plan} onClick={onChangePlan} disabled={busy} />
        <p className="font-mono text-[11px] tabular-nums text-text-sec">
          {user.cityName ?? T.plan.empty}
          <span className="mx-1.5 text-text-sec/40" aria-hidden>
            ·
          </span>
          {MONTH_YEAR.format(new Date(user.createdAt))}
        </p>
      </div>
    </div>
  );
}

export function UsersTableRow({ user, busy, onChangePlan }: Props) {
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
                  className="h-3 w-3 shrink-0 text-primary"
                  aria-label={T.plan.tierPremium}
                />
              ) : null}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-text-sec">
              #{user.id.slice(-8)}
            </p>
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
        {MONTH_YEAR.format(new Date(user.createdAt))}
      </td>
    </tr>
  );
}
