export type SystemFlags = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
  legalDraftMode: boolean;
  // FIX-TELEGRAM-KILLSWITCH: admin toggle for user-facing Telegram. Effective
  // only BELOW the env ceiling (a set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME since
  // ENV-SPLIT-01; the old NEXT_PUBLIC_TELEGRAM_ENABLED is gone) — when the env is
  // off this displays as false (locked) regardless of the stored value.
  telegramEnabled: boolean;
};

export type SeoValues = {
  seoTitle: string;
  seoDescription: string;
};

export type QueueStatsView = {
  pending: number;
  processing: number;
  dead: number;
};

export type DeadJobView = {
  queueIndex: number;
  type: string;
  retryCount: number | null;
};

export type QueueSnapshot = {
  stats: QueueStatsView;
  deadJobs: DeadJobView[];
};

export type VisualSearchStatsView = {
  total: number;
  indexed: number;
  notIndexed: number;
};

export type MediaCleanupStatsView = {
  stalePendingCount: number;
  brokenCount: number;
};

/** VK-COMMUNITY-NOTIFY-01 — зеркало `VkCommunityAdminView` (lib/vk/community.ts):
 * клиентский модуль не импортирует server-only, поэтому форма повторена здесь,
 * а совпадение проверяет компилятор в `settings-data.service.ts`. */
export type VkCommunityView = {
  communityUrl: string | null;
  urlRecognized: boolean;
  configured: boolean;
  community: { groupId: number; screenName: string; name: string; chatUrl: string } | null;
  mismatch: boolean;
  unreadable: boolean;
};

export type AdminSettingsSnapshot = {
  flags: SystemFlags;
  seo: SeoValues;
  vkCommunity: VkCommunityView;
  queue: QueueSnapshot;
  visualSearch: VisualSearchStatsView;
  mediaCleanup: MediaCleanupStatsView;
};
