import { SubscriptionScope } from "@prisma/client";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError, createSystemDisabledError } from "@/lib/billing/guards";

/**
 * Включить онлайн-оплату услуги студии можно только на тарифе с
 * `onlinePayments` и при включённом системном флаге. Тариф — ВЫЗЫВАЮЩЕГО
 * (scope STUDIO), как у остальных гейтов кабинета студии.
 *
 * Одно правило для `PATCH /api/studio/services/{id}` и (MOBILE-STUDIO-C)
 * `POST /api/studio/services`: создание с `onlinePaymentEnabled: true` не
 * должно обходить проверку, которую проходит правка.
 */
export async function ensureStudioOnlinePaymentsAllowed(userId: string): Promise<void> {
  const plan = await getCurrentPlan(userId, SubscriptionScope.STUDIO);
  if (!plan.features.onlinePayments) {
    throw createFeatureGateError("onlinePayments", "PRO");
  }
  if (!plan.system.onlinePaymentsEnabled) {
    throw createSystemDisabledError("onlinePayments");
  }
}
