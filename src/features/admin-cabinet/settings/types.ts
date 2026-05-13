export type SystemFlags = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
  legalDraftMode: boolean;
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
