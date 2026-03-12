"use client";

import useSWR from "swr";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import type { MeIdentity } from "@/lib/users/me";

export type MeUser = MeIdentity;

const fetcher = async (url: string): Promise<{ user: MeUser | null } | null> => {
  const res = await fetchWithAuth(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as ApiResponse<{ user: MeUser | null }> | null;
  if (!res.ok || !json || json.ok !== true) return null;
  return json.data;
};

export function useMe() {
  const { data, error, isLoading } = useSWR<{ user: MeUser | null } | null>("/api/me", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isError: Boolean(error),
  };
}
