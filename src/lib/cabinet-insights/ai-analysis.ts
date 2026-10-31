import "server-only";

import { aiChat } from "@/lib/ai/client";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import * as cache from "@/lib/cache/cache";
import { logError, logInfo } from "@/lib/logging/logger";
import { buildCabinetAnalysisPrompt, parseCabinetAnalysis, readCachedCabinetAnalysis } from "./ai-analysis-prompt";
import type { CabinetAnalysis, CabinetFacts, CabinetScope } from "./types";

/**
 * AI-CABINET-ANALYSIS — ИИ-разбор кабинета (PREMIUM). Доступ, тариф и лимит
 * запусков проверяет роут `POST /api/cabinet/ai-analysis`; здесь — вызов модели
 * и кэш последнего разбора. Денежный потолок держит чокпойнт `aiChat` (метр
 * `cabinet-analysis`, инв. #44) и бросает `AiSpendCeilingError`.
 *
 * Последний разбор хранится неделю на кабинет (не на человека): владелец и
 * администратор студии видят один и тот же разбор. Главная показывает его без
 * нового вызова модели.
 */

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

function cacheKey(scope: CabinetScope, providerId: string): string {
  return `cabinet:ai-analysis:v1:${scope}:${providerId}`;
}

export async function getCachedCabinetAnalysis(scope: CabinetScope, providerId: string): Promise<CabinetAnalysis | null> {
  try {
    return readCachedCabinetAnalysis(await cache.get<unknown>(cacheKey(scope, providerId)));
  } catch {
    return null;
  }
}

/** `null` — модель не ответила или ответ непригоден; лимит запусков роут при этом возвращает. */
export async function generateCabinetAnalysis(facts: CabinetFacts, providerId: string): Promise<CabinetAnalysis | null> {
  const raw = await aiChat({
    scope: "cabinet-analysis",
    systemPrompt: AI_PROMPTS.cabinetAnalysis.system,
    userPrompt: buildCabinetAnalysisPrompt(facts),
    temperature: 0.4,
    maxTokens: 1500,
  });
  if (!raw) return null;

  const analysis = parseCabinetAnalysis(raw, facts.scope);
  if (!analysis) {
    // Текст ответа в лог не идёт: в нём пересказ данных кабинета.
    logError("cabinet.ai-analysis.unparsable", { scope: facts.scope, length: raw.length, __skipAlert: true });
    return null;
  }

  await cache.set(cacheKey(facts.scope, providerId), analysis, CACHE_TTL_SECONDS);
  logInfo("cabinet.ai-analysis.generated", {
    scope: facts.scope,
    improvements: analysis.improvements.length,
  });
  return analysis;
}
