import { z } from "zod";

import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { AiSpendCeilingError } from "@/lib/ai/spend-ceiling";
import { fail, ok, tooManyRequests } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { createFeatureGateError } from "@/lib/billing/guards";
import { cabinetAnalysisAllowed, resolveCabinetPlanContext, type CabinetPlanContext } from "@/lib/cabinet-insights/access";
import { generateCabinetAnalysis } from "@/lib/cabinet-insights/ai-analysis";
import { loadMasterCabinetFacts, loadStudioCabinetFacts } from "@/lib/cabinet-insights/facts";
import type { CabinetAnalysis } from "@/lib/cabinet-insights/types";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import * as UI_TEXT from "@/lib/ui/text";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * AI-CABINET-ANALYSIS — запуск ИИ-разбора своего кабинета (PREMIUM).
 *
 * Порядок проверок — от дешёвого к платному: вход → ИИ включён → свой кабинет
 * (мастер — личный профиль; студия — владелец или администратор) → тариф →
 * лимит запусков → сбор фактов и вызов модели. Лимит — на КАБИНЕТ, а не на
 * человека: владелец и администраторы студии делят три запуска в сутки, разбор
 * у них общий. Запуск, который не дал разбора (модель не ответила, суточный
 * потолок денег, сбой), лимит возвращает.
 */

const bodySchema = z.object({
  scope: z.enum(["master", "studio"]),
});

const RUNS_PER_DAY = { maxRequests: 3, windowSeconds: 24 * 60 * 60 };

async function loadFacts(context: CabinetPlanContext) {
  if (context.scope === "master") {
    return loadMasterCabinetFacts({
      providerId: context.providerId,
      hotSlotsAllowed: context.features.hotSlots === true,
    });
  }
  return context.studioId ? loadStudioCabinetFacts({ studioId: context.studioId }) : null;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const body = await parseBody(req, bodySchema);

    if (!(await getAiFeaturesEnabled())) {
      return fail("ИИ-функции сейчас выключены. Попробуйте позже.", 503, "SYSTEM_FEATURE_DISABLED");
    }

    const context = await resolveCabinetPlanContext(user.id, body.scope);
    if (!cabinetAnalysisAllowed(context.features)) {
      throw createFeatureGateError("aiCabinetAnalysis", body.scope === "studio" ? "STUDIO" : "MASTER");
    }

    const limitKey = routeRateLimitKey(req, "cabinet", `${context.scope}:${context.providerId}`);
    const limit = await checkRateLimit(limitKey, RUNS_PER_DAY);
    if (limit.limited) {
      if (limit.reason === "unavailable") {
        return fail(
          "Сейчас это временно недоступно. Попробуйте ещё раз через минуту.",
          503,
          "RATE_LIMIT_UNAVAILABLE",
        );
      }
      return tooManyRequests(limit.retryAfterSeconds, UI_TEXT.cabinetHome.aiAnalysis.limitReached);
    }

    let analysis: CabinetAnalysis | null = null;
    try {
      const facts = await loadFacts(context);
      analysis = facts ? await generateCabinetAnalysis(facts, context.providerId) : null;
    } catch (error) {
      await refundRateLimit(limitKey);
      throw error;
    }
    if (!analysis) {
      await refundRateLimit(limitKey);
      return fail(UI_TEXT.cabinetHome.aiAnalysis.failed, 503, "SERVICE_UNAVAILABLE");
    }
    return ok({ analysis });
  } catch (error) {
    if (error instanceof AiSpendCeilingError) {
      return tooManyRequests(error.retryAfterSeconds, error.message, error.code);
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/cabinet/ai-analysis failed", {
        requestId: getRequestId(req),
        route: "POST /api/cabinet/ai-analysis",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
