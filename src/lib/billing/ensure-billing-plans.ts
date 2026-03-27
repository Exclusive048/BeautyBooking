import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";

let plansExistPromise: Promise<boolean> | null = null;

export async function ensureBillingPlansExist(): Promise<boolean> {
  if (!plansExistPromise) {
    plansExistPromise = prisma.billingPlan
      .count({ where: { isActive: true } })
      .then((count) => count > 0)
      .catch((error) => {
        plansExistPromise = null;
        logError("Failed to check billing plans existence", {
          error: error instanceof Error ? error.stack ?? error.message : error,
        });
        return false;
      });
  }
  return plansExistPromise;
}
