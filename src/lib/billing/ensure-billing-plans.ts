import { ensureDefaultPlans } from "@/lib/billing/plan-seed";

let ensurePlansPromise: Promise<void> | null = null;

export async function ensureBillingPlans(): Promise<void> {
  if (!ensurePlansPromise) {
    ensurePlansPromise = ensureDefaultPlans().catch((error) => {
      ensurePlansPromise = null;
      throw error;
    });
  }
  await ensurePlansPromise;
}

