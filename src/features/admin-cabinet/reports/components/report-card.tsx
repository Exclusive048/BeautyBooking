"use client";

import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, Flag, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { ViewerDate } from "@/components/ui/viewer-date";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { AdminReportRow } from "@/features/admin-cabinet/reports/types";

const T = UI_TEXT.adminPanel.reports;

type Props = {
  report: AdminReportRow;
  busy: boolean;
  onResolve: () => void;
  onDismiss: () => void;
};

const STATUS_BADGE: Record<AdminReportRow["status"], "warning" | "success" | "muted"> = {
  NEW: "warning",
  RESOLVED: "success",
  DISMISSED: "muted",
};

/**
 * Одна жалоба: слева — на что пожаловались (тип, заголовок, текст или фото,
 * ссылки на сайт и в разделы с инструментами), посередине — кто и почему,
 * справа — решение. Просроченная (NEW дольше 24 часов) — с красным кольцом.
 */
export function ReportCard({ report, busy, onResolve, onDismiss }: Props) {
  const isOpen = report.status === "NEW";
  return (
    <article
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card",
        report.isOverdue && "ring-2 ring-destructive/25",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_220px_200px] lg:items-start">
        {/* Цель жалобы */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="xs" variant="default" className="gap-1">
              <Flag className="h-2.5 w-2.5" aria-hidden />
              {T.targetTypes[report.targetType]}
            </Badge>
            <Badge size="xs" variant={STATUS_BADGE[report.status]}>
              {T.statuses[report.status]}
            </Badge>
            {report.isOverdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide text-white">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                {T.card.overdueBadge}
              </span>
            ) : null}
            <span className="font-mono text-2xs tabular-nums text-text-sec">
              <ViewerDate value={report.createdAt} preset="dayMonthYearShort" />
            </span>
          </div>

          <p className="mt-3 text-sm font-medium text-text-main">{report.target.title}</p>

          <div className="mt-2 flex gap-3">
            {report.target.imageUrl ? (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-bg-input">
                <ResilientImage
                  src={report.target.imageUrl}
                  alt={T.card.photoAlt}
                  sizes="80px"
                  className="object-cover"
                />
              </div>
            ) : null}
            {report.target.excerpt ? (
              <p className="min-w-0 whitespace-pre-line rounded-xl bg-bg-input/60 px-3 py-2 text-sm text-text-main">
                {report.target.excerpt}
              </p>
            ) : null}
          </div>

          {report.target.missing ? (
            <p className="mt-2 text-xs text-text-sec">{T.card.missingTarget}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {report.target.publicUrl ? (
              <Link
                href={report.target.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-accent-text underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                {T.card.openPublic}
              </Link>
            ) : null}
            {report.reviewModerationUrl ? (
              <Link
                href={report.reviewModerationUrl}
                className="inline-flex items-center gap-1 font-medium text-accent-text underline-offset-2 hover:underline"
              >
                {T.card.openReview}
              </Link>
            ) : null}
            {report.offender ? (
              <Link
                href={`/admin/users?q=${encodeURIComponent(report.offender.userId)}`}
                className="inline-flex items-center gap-1 font-medium text-accent-text underline-offset-2 hover:underline"
              >
                <UserRound className="h-3 w-3" aria-hidden />
                {T.card.offenderLabel}: {report.offender.display} · {T.card.openOffender}
              </Link>
            ) : null}
          </div>
        </div>

        {/* Кто и почему */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-destructive/[0.08] p-3 lg:order-2">
          <span className="eyebrow text-danger-text">{T.card.reasonLabel}</span>
          <p className="text-sm font-medium text-text-main">{T.reasons[report.reason]}</p>
          {report.comment ? (
            <>
              <span className="eyebrow mt-1 text-text-sec">{T.card.commentLabel}</span>
              <p className="whitespace-pre-line text-xs text-text-main">{report.comment}</p>
            </>
          ) : null}
          <p className="mt-1 text-xs text-text-sec">
            {T.card.reporterLabel}: <span className="text-text-main">{report.reporter.display}</span>
          </p>
        </div>

        {/* Решение */}
        <div className="lg:order-3">
          {isOpen ? (
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={onResolve} disabled={busy} className="w-full">
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {T.actions.resolve}
              </Button>
              <Button variant="secondary" size="sm" onClick={onDismiss} disabled={busy} className="w-full">
                <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {T.actions.dismiss}
              </Button>
            </div>
          ) : report.resolution ? (
            <div className="flex flex-col gap-1 text-xs text-text-sec">
              <span className="eyebrow text-text-sec">{T.card.resolutionLabel}</span>
              <span className="font-mono tabular-nums">
                <ViewerDate value={report.resolution.at} preset="dayMonthYearShort" />
              </span>
              {report.resolution.byDisplay ? (
                <span>{T.card.resolutionBy(report.resolution.byDisplay)}</span>
              ) : null}
              {report.resolution.note ? (
                <p className="whitespace-pre-line text-text-main">{report.resolution.note}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
