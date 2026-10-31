import "server-only";

import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { logError } from "@/lib/logging/logger";
import type { SetupGuideDto, SetupStepId } from "@/lib/onboarding/setup-guide-shared";
import { cabinetAnalysisAllowed, resolveCabinetPlanContext } from "./access";
import { getCachedCabinetAnalysis } from "./ai-analysis";
import { listCabinetAnnouncements, type CabinetAnnouncement } from "./announcements";
import { loadMasterCabinetFacts, loadStudioCabinetFacts } from "./facts";
import { buildCabinetTips } from "./tips";
import type { CabinetAnalysis, CabinetScope, CabinetTip } from "./types";

/**
 * AI-CABINET-ANALYSIS — нижняя часть главной кабинета одним загрузчиком:
 * советы по данным кабинета, «Новое в МастерРядом» и состояние ИИ-разбора.
 *
 * Это вторичная часть главной: сбой загрузки фактов не роняет страницу — советы
 * пропадают, ошибка уходит в лог, анонсы остаются (они из кода).
 */

export type CabinetHomeInsights = {
  tips: CabinetTip[];
  announcements: CabinetAnnouncement[];
  /** `null` — ИИ выключен: карточки разбора нет вовсе. */
  ai: { allowed: boolean; analysis: CabinetAnalysis | null } | null;
};

/** Шаги «Первых шагов», на которые карточка ещё ведёт: о них советы молчат. */
function openSetupSteps(guide: SetupGuideDto | null): SetupStepId[] {
  if (!guide || guide.hidden) return [];
  return guide.steps.filter((step) => !step.done).map((step) => step.id);
}

export async function loadCabinetHomeInsights(input: {
  userId: string;
  scope: CabinetScope;
  setupGuide: SetupGuideDto | null;
  now?: Date;
}): Promise<CabinetHomeInsights> {
  const now = input.now ?? new Date();
  try {
    const [context, aiEnabled] = await Promise.all([
      resolveCabinetPlanContext(input.userId, input.scope),
      getAiFeaturesEnabled(),
    ]);
    const allowed = cabinetAnalysisAllowed(context.features);
    const [facts, analysis] = await Promise.all([
      context.scope === "master"
        ? loadMasterCabinetFacts({
            providerId: context.providerId,
            hotSlotsAllowed: context.features.hotSlots === true,
            now,
          })
        : context.studioId
          ? loadStudioCabinetFacts({ studioId: context.studioId, now })
          : Promise.resolve(null),
      aiEnabled && allowed ? getCachedCabinetAnalysis(context.scope, context.providerId) : Promise.resolve(null),
    ]);

    return {
      tips: facts ? buildCabinetTips(facts, { openSetupSteps: openSetupSteps(input.setupGuide) }) : [],
      announcements: listCabinetAnnouncements({ scope: input.scope, aiAnalysisAvailable: aiEnabled, now }),
      ai: aiEnabled ? { allowed, analysis } : null,
    };
  } catch (error) {
    logError("cabinet.home-insights.failed", {
      scope: input.scope,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      tips: [],
      announcements: listCabinetAnnouncements({ scope: input.scope, aiAnalysisAvailable: false, now }),
      ai: null,
    };
  }
}
