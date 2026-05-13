"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { StatTile } from "@/features/admin-cabinet/settings/components/stat-tile";
import type { VisualSearchStatsView } from "@/features/admin-cabinet/settings/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Status = "idle" | "running" | "done" | "error";

type Props = {
  initial: VisualSearchStatsView;
  enabled: boolean;
};

export function VisualSearchSection({ initial, enabled }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.visualSearch;

  const [stats] = useState<VisualSearchStatsView>(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nothingToIndex = stats.notIndexed === 0;
  const disableButton = !enabled || nothingToIndex || status === "running";

  const handleReindex = async () => {
    setStatus("running");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/visual-search/reindex", { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.runFailed);
      }
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
                {t.runningIndexLabel}
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
                {t.startedToast}
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
            onClick={() => void handleReindex()}
          >
            {t.runIndexButton}
          </Button>
        </>
      }
    >
      {!enabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200">
          {t.disabledHint}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t.tiles.total} value={stats.total} />
        <StatTile label={t.tiles.indexed} value={stats.indexed} />
        <StatTile
          label={t.tiles.notIndexed}
          value={stats.notIndexed}
          tone={stats.notIndexed > 0 ? "warning" : "neutral"}
        />
      </div>

      {nothingToIndex && enabled ? (
        <p className="text-xs text-text-sec">{t.empty}</p>
      ) : null}
    </SectionCard>
  );
}
