import { ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { getQueueStats, listDeadJobs } from "@/lib/queue/queue";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const [stats, deadJobs] = await Promise.all([getQueueStats(), listDeadJobs(50)]);
  return ok({
    stats,
    deadJobs,
  });
}

