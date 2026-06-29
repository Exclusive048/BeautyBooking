export type SystemFlags = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
  legalDraftMode: boolean;
  // FIX-TELEGRAM-KILLSWITCH: admin toggle for user-facing Telegram. Effective
  // only BELOW the env ceiling (NEXT_PUBLIC_TELEGRAM_ENABLED) — when the env is
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

export type AdminSettingsSnapshot = {
  flags: SystemFlags;
  seo: SeoValues;
  queue: QueueSnapshot;
  visualSearch: VisualSearchStatsView;
  mediaCleanup: MediaCleanupStatsView;
};
