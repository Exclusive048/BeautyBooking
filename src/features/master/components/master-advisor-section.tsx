"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AdvisorInsight } from "@/lib/advisor/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type AdvisorPayload = {
  insights: AdvisorInsight[];
  computedAt: string;
};

type LoadState = {
  data: AdvisorPayload | null;
  loading: boolean;
  error: string | null;
};

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function resolveWeightTone(weight: number): string {
  if (weight >= 9) return "border-l-rose-500";
  if (weight >= 7) return "border-l-amber-500";
  if (weight >= 5) return "border-l-yellow-400";
  return "border-l-sky-500";
}

export function MasterAdvisorSection() {
  const t = UI_TEXT.master.advisor;
  const [state, setState] = useState<LoadState>({
    data: null,
    loading: true,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const isStale = useMemo(() => {
    if (!state.data?.computedAt) return false;
    const computedAt = new Date(state.data.computedAt).getTime();
    if (!Number.isFinite(computedAt)) return false;
    return Date.now() - computedAt > STALE_AFTER_MS;
  }, [state.data?.computedAt]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/master/advisor", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<AdvisorPayload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setState({ data: json.data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : t.errors.load,
      });
    }
  }, [t.errors.load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/master/advisor/refresh", { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<AdvisorPayload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setState({ data: json.data, loading: false, error: null });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : t.errors.refresh,
      }));
    } finally {
      setRefreshing(false);
    }
  }, [t.errors.refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  const insights = state.data?.insights ?? [];

  return (
    <section className="lux-card rounded-[24px] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        {isStale ? (
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? t.refreshing : t.refresh}
          </Button>
        ) : null}
      </div>

      {state.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`advisor-skeleton-${index}`} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : state.error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300">
          {state.error}
        </div>
      ) : insights.length === 0 ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t.staleSuccess}
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`rounded-xl border border-border-subtle border-l-4 bg-bg-input/60 p-3 ${resolveWeightTone(
                insight.weight
              )}`}
            >
              <div className="text-sm font-semibold text-text-main">{insight.title}</div>
              <div className="mt-1 text-xs text-text-sec">{insight.message}</div>
              {insight.action ? (
                <a
                  href={insight.action.href}
                  className="mt-2 inline-flex text-xs font-semibold text-primary underline"
                >
                  {insight.action.label}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
