import { AppError } from "@/lib/api/errors";
import type { PlanTier } from "@/lib/billing/features";

export function createFeatureGateError(feature: string, requiredPlan?: PlanTier): AppError {
  return new AppError("Функция недоступна на текущем тарифе.", 403, "FEATURE_GATE", {
    feature,
    requiredPlan,
  });
}

export function createSystemDisabledError(feature: string): AppError {
  return new AppError("Функция отключена администратором.", 403, "SYSTEM_FEATURE_DISABLED", {
    feature,
  });
}

export function createLimitReachedError(limitKey: string, max: number, current: number): AppError {
  return new AppError("Достигнут лимит.", 409, "LIMIT_REACHED", {
    limitKey,
    max,
    current,
  });
}
