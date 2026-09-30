"use client";

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { StatTile } from "@/features/admin-cabinet/settings/components/stat-tile";
import type { VisualSearchStatsView } from "@/features/admin-cabinet/settings/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { DISTANCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

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
      await fetchJsonWithAuth<unknown>("/api/admin/visual-search/reindex", { method: "POST" });
      setStatus("done");
      window.setTimeout(() => setStatus((curr) => (curr === "done" ? "idle" : curr)), 2400);
    } catch (err) {
      setStatus("error");
      setErrorMessage(serverMessageOr(err, t.runFailed));
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
              <m.span
                key="running"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-text-sec"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t.runningIndexLabel}
              </m.span>
            ) : status === "done" ? (
              <m.span
                key="done"
                initial={{ opacity: 0, y: -DISTANCE.nudge }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-success-text"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {t.startedToast}
              </m.span>
            ) : status === "error" ? (
              <m.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-danger-text"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                {errorMessage ?? t.runFailed}
              </m.span>
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
        <div className="rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text">
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
