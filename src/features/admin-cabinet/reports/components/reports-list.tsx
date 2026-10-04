"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { ReportCard } from "@/features/admin-cabinet/reports/components/report-card";
import {
  ReportDecisionDialog,
  type ReportDecisionKind,
} from "@/features/admin-cabinet/reports/components/decision-dialog";
import type {
  AdminReportRow,
  AdminReportStatusTab,
} from "@/features/admin-cabinet/reports/types";

const T = UI_TEXT.adminPanel.reports;

type Props = {
  rows: AdminReportRow[];
  nextCursor: string | null;
  status: AdminReportStatusTab;
};

type DecidedReport = { status: AdminReportRow["status"]; at: string; note: string | null };

/**
 * Карточки жалоб и общий диалог решения. Решённая жалоба сразу уходит из
 * вкладки «Новые» (на остальных — меняет состояние на месте), затем
 * `router.refresh()` пересчитывает счётчики с сервера.
 */
export function ReportsList({ rows, nextCursor, status }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const toast = useToast();

  const [decided, setDecided] = useState<Record<string, DecidedReport>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ report: AdminReportRow; kind: ReportDecisionKind } | null>(
    null,
  );

  const visible = rows
    .filter((row) => !(status === "new" && decided[row.id]))
    .map((row): AdminReportRow => {
      const decision = decided[row.id];
      if (!decision) return row;
      return {
        ...row,
        status: decision.status,
        isOverdue: false,
        resolution: { at: decision.at, byDisplay: null, note: decision.note },
      };
    });

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("cursor", nextCursor);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }, [nextCursor, pathname, router, searchParams]);

  const handleConfirm = async (note: string) => {
    if (!target) return;
    const { report, kind } = target;
    setBusyId(report.id);
    try {
      await fetchJsonWithAuth<unknown>(`/api/admin/reports/${encodeURIComponent(report.id)}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { note } : {}),
      });
      setDecided((prev) => ({
        ...prev,
        [report.id]: {
          status: kind === "resolve" ? "RESOLVED" : "DISMISSED",
          at: new Date().toISOString(),
          note: note || null,
        },
      }));
      setTarget(null);
      toast.success(kind === "resolve" ? T.toasts.resolved : T.toasts.dismissed);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.errorGeneric));
    } finally {
      setBusyId(null);
    }
  };

  if (visible.length === 0 && !nextCursor) {
    const isNew = status === "new";
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-bg-card px-4 py-12 text-center shadow-card">
        <Inbox className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden strokeWidth={1.5} />
        <p className="mb-1 font-display text-base text-text-main">
          {isNew ? T.empty.newTitle : T.empty.otherTitle}
        </p>
        <p className="max-w-xs text-sm text-text-sec">
          {isNew ? T.empty.newHint : T.empty.otherHint}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        {visible.map((row) => (
          <ReportCard
            key={row.id}
            report={row}
            busy={busyId === row.id}
            onResolve={() => setTarget({ report: row, kind: "resolve" })}
            onDismiss={() => setTarget({ report: row, kind: "dismiss" })}
          />
        ))}
      </div>

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="md" onClick={loadMore}>
            {T.pagination.loadMore}
          </Button>
        </div>
      ) : null}

      <ReportDecisionDialog
        kind={target?.kind ?? null}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
