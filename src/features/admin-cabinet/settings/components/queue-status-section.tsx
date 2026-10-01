"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { StatTile } from "@/features/admin-cabinet/settings/components/stat-tile";
import type { QueueSnapshot } from "@/features/admin-cabinet/settings/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type ApiPayload = {
  stats: { pending: number; processing: number; dead: number };
  deadJobs: Array<{
    queueIndex: number;
    job: { type: string; attempts?: number };
  }>;
};

type Props = {
  initial: QueueSnapshot;
};

export function QueueStatusSection({ initial }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.queue;

  const [snapshot, setSnapshot] = useState<QueueSnapshot>(initial);
  const [loading, setLoading] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJsonWithAuth<ApiPayload>("/api/admin/queue", { cache: "no-store" });
      setSnapshot({
        stats: data.stats,
        deadJobs: data.deadJobs.map((item) => ({
          queueIndex: item.queueIndex,
          type: item.job.type,
          retryCount: typeof item.job.attempts === "number" ? item.job.attempts : null,
        })),
      });
    } catch (err) {
      setError(serverMessageOr(err, t.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [t.loadFailed]);

  useEffect(() => {
    // Auto-refresh once when the section mounts client-side to catch jobs
    // that have moved since SSR. Subsequent refreshes are manual.
    const handle = window.setTimeout(() => void refresh(), 600);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  const retry = async (index: number) => {
    setBusyIndex(index);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/admin/queue/${index}`, { method: "PATCH" });
      await refresh();
    } catch (err) {
      setError(serverMessageOr(err, t.retryFailed));
    } finally {
      setBusyIndex(null);
    }
  };

  const remove = async (index: number) => {
    setBusyIndex(index);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/admin/queue/${index}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(serverMessageOr(err, t.deleteFailed));
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <SectionCard
      title={t.title}
      description={t.desc}
      rightSlot={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
          {loading ? t.refreshingLabel : t.refreshButton}
        </Button>
      }
    >
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t.tiles.pending} value={snapshot.stats.pending} />
        <StatTile label={t.tiles.processing} value={snapshot.stats.processing} />
        <StatTile
          label={t.tiles.dead}
          value={snapshot.stats.dead}
          tone={snapshot.stats.dead > 0 ? "danger" : "neutral"}
        />
      </div>

      {snapshot.deadJobs.length > 0 ? (
        <div className="mt-1">
          <p className="mb-2 eyebrow text-2xs">
            {t.deadJobsTitle}
          </p>
          <ul className="space-y-2">
            {snapshot.deadJobs.map((item) => (
              <li
                key={item.queueIndex}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-input/40 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-mono text-text-main">{item.type}</span>
                  {item.retryCount !== null ? (
                    <span className="ml-2 text-xs text-text-sec">×{item.retryCount}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyIndex === item.queueIndex}
                    onClick={() => void retry(item.queueIndex)}
                  >
                    {busyIndex === item.queueIndex ? t.retrying : t.retry}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busyIndex === item.queueIndex}
                    onClick={() => void remove(item.queueIndex)}
                  >
                    {t.delete}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-text-sec">{t.deadJobsEmpty}</p>
      )}
    </SectionCard>
  );
}
