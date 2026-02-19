"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurrentPlanInfo, PlanFeatures } from "@/lib/billing/types";

type SubscriptionScope = "MASTER" | "STUDIO";

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type LimitFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends number | null ? Key : never;
}[keyof PlanFeatures];

type PlanState = {
  loading: boolean;
  error: string | null;
  data: CurrentPlanInfo | null;
};

export function usePlanFeatures(scope?: SubscriptionScope) {
  const [state, setState] = useState<PlanState>({
    loading: true,
    error: null,
    data: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = scope ? `/api/me/plan?scope=${scope}` : "/api/me/plan";
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: CurrentPlanInfo }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        const message =
          json && "error" in json && json.error?.message
            ? json.error.message
            : "Не удалось загрузить тариф";
        throw new Error(message);
      }
      setState({ loading: false, error: null, data: json.data });
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось загрузить тариф",
        data: null,
      });
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const features = state.data?.features ?? null;
  const system = state.data?.system ?? null;

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
      loading: state.loading,
      error: state.error,
      planCode: state.data?.planCode ?? null,
      tier: state.data?.tier ?? null,
      scope: state.data?.scope ?? null,
      planId: state.data?.planId ?? null,
      features,
      system,
      can,
      limit,
      reload: load,
    }),
    [state, features, system, can, limit, load]
  );
}
