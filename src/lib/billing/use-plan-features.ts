"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { CurrentPlanInfo, PlanFeatures } from "@/lib/billing/types";
import { fetchJson, serverMessageOr } from "@/lib/http/client";

type SubscriptionScope = "MASTER" | "STUDIO";

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type LimitFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends number | null ? Key : never;
}[keyof PlanFeatures];

const PLAN_LOAD_ERROR = "Не удалось загрузить тариф. Попробуйте ещё раз.";

async function fetchCurrentPlan(url: string): Promise<CurrentPlanInfo> {
  try {
    return await fetchJson<CurrentPlanInfo>(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(serverMessageOr(error, PLAN_LOAD_ERROR));
  }
}

export function usePlanFeatures(scope?: SubscriptionScope) {
  const url = scope ? `/api/me/plan?scope=${scope}` : "/api/me/plan";
  const { data, error, isLoading, mutate } = useSWR<CurrentPlanInfo>(url, fetchCurrentPlan, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  const reload = useCallback(async () => {
    const next = await mutate();
    return next ?? null;
  }, [mutate]);

  const features = data?.features ?? null;
  const system = data?.system ?? null;

  const can = useCallback(
    (key: BooleanFeatureKey) => {
      if (!features) return false;
      return Boolean(features[key]);
    },
    [features]
  );

  const limit = useCallback(
    (key: LimitFeatureKey) => {
      if (!features) return null;
      return features[key] ?? null;
    },
    [features]
  );

  return useMemo(
    () => ({
      loading: isLoading,
      error: error instanceof Error ? error.message : null,
      planCode: data?.planCode ?? null,
      tier: data?.tier ?? null,
      scope: data?.scope ?? null,
      planId: data?.planId ?? null,
      features,
      system,
      can,
      limit,
      reload,
    }),
    [can, data, error, features, isLoading, limit, reload, system]
  );
}

