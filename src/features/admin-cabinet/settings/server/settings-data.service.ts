import { getSystemFlags } from "@/features/admin-cabinet/settings/server/flags.service";
import { getMediaCleanupStatsView } from "@/features/admin-cabinet/settings/server/media-cleanup-stats.service";
import { getQueueSnapshot } from "@/features/admin-cabinet/settings/server/queue-stats.service";
import { getSeoValues } from "@/features/admin-cabinet/settings/server/seo.service";
import { getVisualSearchStatsView } from "@/features/admin-cabinet/settings/server/visual-search-stats.service";
import type { AdminSettingsSnapshot } from "@/features/admin-cabinet/settings/types";

export async function getAdminSettingsSnapshot(): Promise<AdminSettingsSnapshot> {
  const [flags, seo, queue, visualSearch, mediaCleanup] = await Promise.all([
    getSystemFlags(),
    getSeoValues(),
    getQueueSnapshot(),
    getVisualSearchStatsView(),
    getMediaCleanupStatsView(),
  ]);

  return { flags, seo, queue, visualSearch, mediaCleanup };
}
