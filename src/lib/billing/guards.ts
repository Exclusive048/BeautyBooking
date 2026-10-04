import type { SubscriptionScope } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { cheapestPlanTierWithFeature } from "@/lib/billing/required-plan";

/**
 * Отказ «нет в тарифе». `details.requiredPlan` — самый дешёвый тариф каталога
 * с этой фичей для кабинета `scope` (MOBILE-POLISH, `required-plan.ts`), а не
 * константа вызывающего: подсказка не может разойтись с каталогом.
 */
export function createFeatureGateError(feature: string, scope?: SubscriptionScope): AppError {
  return new AppError("Это доступно на тарифах выше. Откройте раздел «Подписка», чтобы перейти.", 403, "FEATURE_GATE", {
    feature,
    requiredPlan: cheapestPlanTierWithFeature(feature, scope),
  });
}

export function createSystemDisabledError(feature: string): AppError {
  return new AppError("Эта возможность временно выключена. Попробуйте позже.", 403, "SYSTEM_FEATURE_DISABLED", {
    feature,
  });
}

export function createLimitReachedError(limitKey: string, max: number, current: number): AppError {
  return new AppError("Больше добавить нельзя на вашем тарифе. Перейдите на тариф выше.", 409, "LIMIT_REACHED", {
    limitKey,
    max,
    current,
  });
}
