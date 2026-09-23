import { getSystemFlags } from "@/features/admin-cabinet/settings/server/flags.service";
import { getMediaCleanupStatsView } from "@/features/admin-cabinet/settings/server/media-cleanup-stats.service";
import { getQueueSnapshot } from "@/features/admin-cabinet/settings/server/queue-stats.service";
import { getSeoValues } from "@/features/admin-cabinet/settings/server/seo.service";
import { getVisualSearchStatsView } from "@/features/admin-cabinet/settings/server/visual-search-stats.service";
import type { AdminSettingsSnapshot, VkCommunityView } from "@/features/admin-cabinet/settings/types";
import { getVkCommunityAdminView } from "@/lib/vk/community";

export async function getAdminSettingsSnapshot(): Promise<AdminSettingsSnapshot> {
  const [flags, seo, vkCommunity, queue, visualSearch, mediaCleanup] = await Promise.all([
    getSystemFlags(),
    getSeoValues(),
    getVkCommunityAdminView() satisfies Promise<VkCommunityView>,
    getQueueSnapshot(),
    getVisualSearchStatsView(),
    getMediaCleanupStatsView(),
  ]);

  return { flags, seo, vkCommunity, queue, visualSearch, mediaCleanup };
}
