"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UsersRoleTile } from "@/features/admin-cabinet/users/components/users-role-tile";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminUserCounts,
  AdminUserRoleGroup,
} from "@/features/admin-cabinet/users/types";

type Props = {
  counts: AdminUserCounts;
  current: AdminUserRoleGroup;
};

const T = UI_TEXT.adminPanel.users.tiles;

const TILES: Array<{ value: AdminUserRoleGroup; label: string; key: keyof AdminUserCounts }> = [
  { value: "all", label: T.all, key: "all" },
  { value: "client", label: T.client, key: "client" },
  { value: "master", label: T.master, key: "master" },
  { value: "studio", label: T.studio, key: "studio" },
  { value: "admin", label: T.admin, key: "admin" },
];

/** Role-filter strip — drives `?role=…` URL state. Clicking a tile
 * also clears `?cursor=` so the table starts fresh; otherwise a
 * filter change while paginated would surface stale rows above
 * page-1 results. */
export function UsersRoleTiles({ counts, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setRole = useCallback(
    (next: AdminUserRoleGroup) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "all") params.delete("role");
      else params.set("role", next);
      params.delete("cursor");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
      {TILES.map((tile) => (
        <UsersRoleTile
          key={tile.value}
          label={tile.label}
          count={counts[tile.key]}
          active={current === tile.value}
          onClick={() => setRole(tile.value)}
        />
      ))}
    </div>
  );
}
