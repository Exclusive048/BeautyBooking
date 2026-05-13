import { AdminUsers } from "@/features/admin-cabinet/users/components/admin-users";
import {
  listAdminPlans,
  listAdminUsers,
} from "@/features/admin-cabinet/users/server/users.service";
import type {
  AdminUserPlanFilter,
  AdminUserRoleGroup,
} from "@/features/admin-cabinet/users/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  role?: string;
  plan?: string;
  q?: string;
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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const role = parseRole(params.role);
  const planTier = parsePlan(params.plan);
  const search = (params.q ?? "").trim();
  const cursor = params.cursor?.trim() || null;

  const [list, plans] = await Promise.all([
    listAdminUsers({ roleGroup: role, planTier, search, cursor }),
    listAdminPlans(),
  ]);

  return (
    <AdminUsers
      rows={list.users}
      counts={list.counts}
      plans={plans}
      nextCursor={list.nextCursor}
      filters={{ role, planTier, search }}
    />
  );
}
