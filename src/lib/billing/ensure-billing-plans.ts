import { ensureDefaultPlans } from "@/lib/billing/plan-seed";
import { logError } from "@/lib/logging/logger";

let ensurePlansPromise: Promise<void> | null = null;

export async function ensureBillingPlans(): Promise<void> {
  if (!ensurePlansPromise) {
    ensurePlansPromise = ensureDefaultPlans().catch((error) => {
      ensurePlansPromise = null;
      logError("Failed to ensure billing plans", {
        error: error instanceof Error ? error.stack ?? error.message : error,
      });
    });
  }
  await ensurePlansPromise;
}

