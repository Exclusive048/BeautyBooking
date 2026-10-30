import { UsersFilters } from "@/features/admin-cabinet/users/components/users-filters";
import { UsersHeader } from "@/features/admin-cabinet/users/components/users-header";
import { UsersRoleTiles } from "@/features/admin-cabinet/users/components/users-role-tiles";
import { UsersTable } from "@/features/admin-cabinet/users/components/users-table";
import type {
  AdminBillingPlanOption,
  AdminUserCounts,
  AdminUserPlanFilter,
  AdminUserRoleGroup,
  AdminUserRow,
  AdminUserStatusFilter,
  AdminUsersViewer,
} from "@/features/admin-cabinet/users/types";

type Props = {
  rows: AdminUserRow[];
  counts: AdminUserCounts;
  plans: AdminBillingPlanOption[];
  nextCursor: string | null;
  filters: {
    role: AdminUserRoleGroup;
    planTier: AdminUserPlanFilter;
    status: AdminUserStatusFilter;
    search: string;
  };
  viewer: AdminUsersViewer;
};

/**
 * Server orchestrator for `/admin/users`. Slots together the caption,
 * 5-tile role strip, redundant filter row, and the table+pagination.
 * Each child owns its own URL-state writes via `router.replace`; this
 * wrapper just threads server-loaded data downward.
 */
export function AdminUsers({
  rows,
  counts,
  plans,
  nextCursor,
  filters,
  viewer,
}: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <UsersHeader total={counts.all} />
      <UsersRoleTiles counts={counts} current={filters.role} />
      <UsersFilters
        role={filters.role}
        planTier={filters.planTier}
        status={filters.status}
        search={filters.search}
      />
      <UsersTable
        rows={rows}
        plans={plans}
        nextCursor={nextCursor}
        viewer={viewer}
      />
    </div>
  );
}
