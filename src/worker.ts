import { dequeue } from "@/lib/queue/queue";
import { logInfo } from "@/lib/logging/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  while (true) {
    const job = await dequeue();
    if (job) {
      logInfo("Worker received job", { job });
      continue;
    }
    await sleep(500);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logInfo("Worker stopped", { error: message });
});
