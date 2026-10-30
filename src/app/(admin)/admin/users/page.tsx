import { headers } from "next/headers";
import { AdminUsers } from "@/features/admin-cabinet/users/components/admin-users";
import {
  listAdminPlans,
  listAdminUsers,
} from "@/features/admin-cabinet/users/server/users.service";
import type {
  AdminUserPlanFilter,
  AdminUserRoleGroup,
  AdminUserStatusFilter,
} from "@/features/admin-cabinet/users/types";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { extractClientIp } from "@/lib/http/ip";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  role?: string;
  plan?: string;
  q?: string;
  status?: string;
  cursor?: string;
}>;

function parseRole(value: string | undefined): AdminUserRoleGroup {
  if (
    value === "client" ||
    value === "master" ||
    value === "studio" ||
    value === "admin" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

function parsePlan(value: string | undefined): AdminUserPlanFilter {
  if (value === "free" || value === "pro" || value === "premium" || value === "all") {
    return value;
  }
  return "all";
}

function parseStatus(value: string | undefined): AdminUserStatusFilter {
  return value === "blocked" ? "blocked" : "all";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const role = parseRole(params.role);
  const planTier = parsePlan(params.plan);
  const status = parseStatus(params.status);
  const search = (params.q ?? "").trim();
  const cursor = params.cursor?.trim() || null;

  // RKN-FIX-10: чей это просмотр — решает страница (сессия уже здесь), сервис
  // остаётся вызываемым из тестов/скриптов. Route-group layout уже отсёк
  // не-админов, так что getSessionUser здесь — идентификация, а не гейт.
  const actor = await getSessionUser();

  const [list, plans] = await Promise.all([
    listAdminUsers({
      roleGroup: role,
      planTier,
      status,
      search,
      cursor,
      actorUserId: actor?.id ?? null,
      actorIp: extractClientIp({ headers: await headers() }),
    }),
    listAdminPlans(),
  ]);

  return (
    <AdminUsers
      rows={list.users}
      counts={list.counts}
      plans={plans}
      nextCursor={list.nextCursor}
      filters={{ role, planTier, status, search }}
      viewer={{
        id: actor?.id ?? null,
        // USER-BLOCKING-01: администраторов блокирует только SUPERADMIN
        // (`block.service.ts`) — остальным кнопку не показываем.
        canManageAdmins: actor?.roles.includes(AccountType.SUPERADMIN) ?? false,
      }}
    />
  );
}
