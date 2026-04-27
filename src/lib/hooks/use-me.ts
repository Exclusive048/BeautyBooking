"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import type { MeIdentity } from "@/lib/users/me";

export type MeUser = MeIdentity;

const AUTH_PAGES = new Set(["/login", "/logout"]);

const fetcher = async (url: string): Promise<{ user: MeUser | null } | null> => {
  const res = await fetchWithAuth(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as ApiResponse<{ user: MeUser | null }> | null;
  if (!res.ok || !json || json.ok !== true) return null;
  return json.data;
};

export function useMe() {
  const pathname = usePathname();
  // Don't poll /api/me on auth pages — the user is not logged in, every 401 response
  // triggers a re-render in layout components which can disrupt the OTP flow.
  const key = AUTH_PAGES.has(pathname) ? null : "/api/me";

  const { data, error, isLoading } = useSWR<{ user: MeUser | null } | null>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isError: Boolean(error),
  };
}
