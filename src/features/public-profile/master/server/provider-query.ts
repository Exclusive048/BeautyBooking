import { cache } from "react";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ApiResponse } from "@/lib/types/api";

export const getProvider = cache(async (providerId: string): Promise<ProviderProfileDto | null> => {
  if (!providerId) return null;
  const res = await fetch(`/api/providers/${providerId}`, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as ApiResponse<{ provider: ProviderProfileDto | null }> | null;
  if (!res.ok || !json || !json.ok) return null;
  return json.data.provider ?? null;
});
