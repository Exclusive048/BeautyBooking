"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { StatTile } from "@/features/admin-cabinet/settings/components/stat-tile";
import type { MediaCleanupStatsView } from "@/features/admin-cabinet/settings/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Status = "idle" | "running" | "done" | "error";

type Props = {
  initial: MediaCleanupStatsView;
};

export function MediaCleanupSection({ initial }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.mediaCleanup;

  const [stats, setStats] = useState<MediaCleanupStatsView>(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nothingToClean = stats.stalePendingCount === 0 && stats.brokenCount === 0;
  const disableButton = nothingToClean || status === "running";

  const handleRun = async () => {
    setStatus("running");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/media/broken", { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        stats: { stalePendingCount: number; brokenCount: number };
      }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.runFailed);
      }
      setStats({
        stalePendingCount: json.data.stats.stalePendingCount,
        brokenCount: json.data.stats.brokenCount,
      });
      setStatus("done");
      window.setTimeout(() => setStatus((curr) => (curr === "done" ? "idle" : curr)), 2400);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t.runFailed);
    }
  };

  return (
    <SectionCard
      title={t.title}
      description={t.desc}
      footer={
        <>
          <AnimatePresence mode="wait">
            {status === "running" ? (
              <motion.span
                key="running"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-text-sec"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t.runningCleanupLabel}
              </motion.span>
            ) : status === "done" ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {t.doneToast}
              </motion.span>
            ) : status === "error" ? (
              <motion.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                {errorMessage ?? t.runFailed}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <Button
            variant="secondary"
            size="sm"
            disabled={disableButton}
            onClick={() => void handleRun()}
          >
            {t.runCleanupButton}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          label={t.tiles.pending}
          value={stats.stalePendingCount}
          tone={stats.stalePendingCount > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label={t.tiles.broken}
          value={stats.brokenCount}
          tone={stats.brokenCount > 0 ? "danger" : "neutral"}
        />
      </div>

      {nothingToClean ? <p className="text-xs text-text-sec">{t.empty}</p> : null}
    </SectionCard>
  );
}
