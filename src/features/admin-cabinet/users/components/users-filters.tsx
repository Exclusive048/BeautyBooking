"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminUserPlanFilter,
  AdminUserRoleGroup,
} from "@/features/admin-cabinet/users/types";

type Props = {
  role: AdminUserRoleGroup;
  planTier: AdminUserPlanFilter;
  search: string;
};

const T = UI_TEXT.adminPanel.users.filters;
const ROLE = UI_TEXT.adminPanel.users.tiles;
const PLAN = UI_TEXT.adminPanel.users.plan;
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Filter row sitting beneath the tile strip. Provides redundant role
 * select (for keyboard-only users / mobile), plan-tier filter, and a
 * debounced search box. URL is the single source of truth — every
 * mutation goes through `router.replace`.
 */
export function UsersFilters({ role, planTier, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [, startTransition] = useTransition();

  const pushParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutator(params);
      params.delete("cursor");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (searchValue === search) return;
    const handle = window.setTimeout(() => {
      pushParams((params) => {
        if (searchValue.trim()) params.set("q", searchValue.trim());
        else params.delete("q");
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchValue, search, pushParams]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
      <Select
        aria-label={T.roleAll}
        value={role}
        onChange={(event) =>
          pushParams((params) => {
            const next = event.target.value;
            if (next === "all") params.delete("role");
            else params.set("role", next);
          })
        }
        className="h-10 min-w-[10rem]"
      >
        <option value="all">{T.roleAll}</option>
        <option value="client">{ROLE.client}</option>
        <option value="master">{ROLE.master}</option>
        <option value="studio">{ROLE.studio}</option>
        <option value="admin">{ROLE.admin}</option>
      </Select>

      <Select
        aria-label={T.planAll}
        value={planTier}
        onChange={(event) =>
          pushParams((params) => {
            const next = event.target.value;
            if (next === "all") params.delete("plan");
            else params.set("plan", next);
          })
        }
        className="h-10 min-w-[10rem]"
      >
        <option value="all">{T.planAll}</option>
        <option value="free">{PLAN.tierFree}</option>
        <option value="pro">{PLAN.tierPro}</option>
        <option value="premium">{PLAN.tierPremium}</option>
      </Select>

      <div className="relative min-w-[16rem] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={T.searchPlaceholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}
