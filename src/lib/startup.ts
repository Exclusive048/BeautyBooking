import { validateEnv } from "@/lib/env";
import { ensureBillingPlans } from "@/lib/billing/ensure-billing-plans";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";

validateEnv();

const shouldSkipDbStartup =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test";

async function runStartupChecks(): Promise<void> {
  if (shouldSkipDbStartup) return;

  try {
    await ensureBillingPlans();
  } catch (error) {
    logError("CRITICAL: Failed to ensure billing plans on startup", {
      error: error instanceof Error ? error.stack : error,
    });
    void sendTelegramAlert(
      "🚨 Старт сервера: не удалось создать billing plans. Регистрация может работать некорректно.",
      "startup:billing-plans"
    );
  }
}

void runStartupChecks();
