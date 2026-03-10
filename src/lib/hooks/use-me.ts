"use client";

import useSWR from "swr";
import type { ApiResponse } from "@/lib/types/api";
import type { MeProfile } from "@/lib/users/profile";

export type MeUser = MeProfile;

const fetcher = async (url: string): Promise<{ user: MeUser | null } | null> => {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
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
