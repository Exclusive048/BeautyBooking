import { cache } from "react";
import {
  fetchStudioMasters,
  fetchStudioProfile,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import type { ProviderProfileDto } from "@/lib/providers/dto";

export const getStudioProfile = cache(async (studioId: string): Promise<ProviderProfileDto | null> => {
  if (!studioId) return null;
  const result = await fetchStudioProfile(studioId);
  return result.ok ? result.provider : null;
});

export const getStudioMasters = cache(async (studioId: string): Promise<StudioMaster[]> => {
  if (!studioId) return [];
  const result = await fetchStudioMasters(studioId);
  return result.ok ? result.masters : [];
});
