import { getMediaCleanupStats } from "@/lib/media/cleanup";
import type { MediaCleanupStatsView } from "@/features/admin-cabinet/settings/types";

export async function getMediaCleanupStatsView(): Promise<MediaCleanupStatsView> {
  const stats = await getMediaCleanupStats();
  return {
    stalePendingCount: stats.stalePendingCount,
    brokenCount: stats.brokenCount,
  };
}
