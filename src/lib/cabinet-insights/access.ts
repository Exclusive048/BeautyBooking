import "server-only";

import { SubscriptionScope } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import type { PlanFeatures } from "@/lib/billing/features";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import type { CabinetScope } from "./types";

/**
 * AI-CABINET-ANALYSIS — чей кабинет разбираем и что разрешает тариф. Одно место
 * для роута разбора и для главных кабинетов (что показать: замок или кнопку).
 *
 * Тариф кабинета: у мастера — его подписка MASTER, у студии — подписка STUDIO
 * ВЛАДЕЛЬЦА (как лимит команды, `studio/team-limits.ts`): администратор студии
 * пользуется тем, за что платит владелец.
 */
export type CabinetPlanContext = {
  scope: CabinetScope;
  /** `Provider.id` кабинета — ключ кэша разбора и лимита запусков. */
  providerId: string;
  /** `Studio.id` — только у студии. */
  studioId: string | null;
  features: PlanFeatures;
};

async function studioOwnerFeatures(studioId: string): Promise<PlanFeatures | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { ownerUserId: true, provider: { select: { ownerUserId: true } } },
  });
  const ownerUserId = studio?.ownerUserId ?? studio?.provider.ownerUserId ?? null;
  if (!ownerUserId) return null;
  return (await getCurrentPlan(ownerUserId, SubscriptionScope.STUDIO)).features;
}

/**
 * @throws 403 FORBIDDEN — у пользователя нет такого кабинета (мастеру студии
 *   разбор студии недоступен: у него нет кабинета студии).
 */
export async function resolveCabinetPlanContext(userId: string, scope: CabinetScope): Promise<CabinetPlanContext> {
  if (scope === "master") {
    const providerId = await getCurrentMasterProviderId(userId);
    const plan = await getCurrentPlan(userId, SubscriptionScope.MASTER);
    return { scope, providerId, studioId: null, features: plan.features };
  }
  const access = await requireStudioCabinetAdmin(userId);
  const features = await studioOwnerFeatures(access.studioId);
  if (!features) {
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
  }
  return { scope, providerId: access.providerId, studioId: access.studioId, features };
}

export function cabinetAnalysisAllowed(features: Pick<PlanFeatures, "aiCabinetAnalysis">): boolean {
  return features.aiCabinetAnalysis === true;
}
