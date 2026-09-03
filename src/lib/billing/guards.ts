import { AppError } from "@/lib/api/errors";
import type { PlanTier } from "@/lib/billing/features";

export function createFeatureGateError(feature: string, requiredPlan?: PlanTier): AppError {
  return new AppError("Это доступно на тарифах выше. Откройте раздел «Подписка», чтобы перейти.", 403, "FEATURE_GATE", {
    feature,
    requiredPlan,
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
