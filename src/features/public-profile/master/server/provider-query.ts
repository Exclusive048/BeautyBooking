import { cache } from "react";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ProviderProfileDto } from "@/lib/providers/dto";

export const getProvider = cache(async (providerId: string): Promise<ProviderProfileDto | null> => {
  if (!providerId) return null;
  const json = await serverApiFetch<{ provider: ProviderProfileDto | null }>(`/api/providers/${providerId}`);
  if (!json.ok) return null;
  return json.data.provider ?? null;
});
