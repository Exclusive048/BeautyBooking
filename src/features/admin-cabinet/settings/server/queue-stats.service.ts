import { getQueueStats, listDeadJobs } from "@/lib/queue/queue";
import type { QueueSnapshot } from "@/features/admin-cabinet/settings/types";

export async function getQueueSnapshot(): Promise<QueueSnapshot> {
  const [stats, deadJobs] = await Promise.all([getQueueStats(), listDeadJobs(50)]);

  return {
    stats,
    deadJobs: deadJobs.map((entry) => ({
      queueIndex: entry.queueIndex,
      type: entry.job.type,
      retryCount: typeof entry.job.attempts === "number" ? entry.job.attempts : null,
    })),
  };
}
