import { cache } from "react";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";

export const getStudioProfile = cache(async (studioId: string): Promise<ProviderProfileDto | null> => {
  if (!studioId) return null;
  const json = await serverApiFetch<{ provider: ProviderProfileDto | null }>(`/api/providers/${studioId}`);
  if (!json.ok) return null;
  return json.data.provider ?? null;
});

export const getStudioMasters = cache(async (studioId: string): Promise<StudioMaster[]> => {
  if (!studioId) return [];
  const json = await serverApiFetch<{ masters: StudioMaster[] }>(`/api/providers/${studioId}/masters`);
  if (!json.ok) return [];
  return json.data.masters ?? [];
});
