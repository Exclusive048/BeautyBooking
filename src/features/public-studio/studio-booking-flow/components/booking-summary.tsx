"use client";

import { Calendar, Check, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  serviceName: string | null;
  masterName: string | null;
  isAnyMaster: boolean;
  dateLabel: string | null;
  timeLabel: string | null;
  /** FIX-BATCH-C Defect 1: «(город, GMT+N)» salon-tz label, "" when same zone. */
  zoneLabel?: string | null;
  totalKopeks: number | null;
  cancellationDeadlineHours: number | null;
  submitDisabled: boolean;
  submitLoading: boolean;
  onSubmit: () => void;
  statusLabel: string;
};

export function BookingSummary({
  serviceName,
  masterName,
  isAnyMaster,
  dateLabel,
  timeLabel,
  zoneLabel,
  totalKopeks,
  cancellationDeadlineHours,
  submitDisabled,
  submitLoading,
  onSubmit,
  statusLabel,
}: Props) {
  const ready = !submitDisabled;
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-sm">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider ${
          ready ? "bg-success/10 text-success-text" : "bg-muted text-text-muted"
        }`}
      >
        {ready ? <Check className="h-3 w-3" aria-hidden /> : null}
        {statusLabel}
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold text-text">{UI_TEXT.bookingWidget.summary.title}</h3>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-text-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {UI_TEXT.bookingWidget.summary.rowService}
          </dt>
          <dd className={`max-w-[60%] truncate text-right font-medium ${serviceName ? "text-text" : "text-text-muted"}`}>
            {serviceName ?? UI_TEXT.bookingWidget.summary.empty}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-text-muted">
            <User className="h-3.5 w-3.5" aria-hidden />
            {UI_TEXT.bookingWidget.summary.rowMaster}
          </dt>
          <dd className={`max-w-[60%] truncate text-right font-medium ${masterName || isAnyMaster ? "text-text" : "text-text-muted"}`}>
            {isAnyMaster ? UI_TEXT.bookingWidget.summary.anyMaster : masterName ?? UI_TEXT.bookingWidget.summary.emptyM}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-2 text-text-muted">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            {UI_TEXT.bookingWidget.summary.rowWhen}
          </dt>
          <dd className={`max-w-[60%] truncate text-right font-medium ${dateLabel && timeLabel ? "text-text" : "text-text-muted"}`}>
            {dateLabel && timeLabel ? `${dateLabel} · ${timeLabel}` : UI_TEXT.bookingWidget.summary.emptyW}
          </dd>
        </div>
        {timeLabel && zoneLabel ? (
          <div className="flex justify-end text-xs font-medium text-accent-text">
            {UI_TEXT.bookingWidget.summary.salonTimeNote} {zoneLabel}
          </div>
        ) : null}
        {totalKopeks !== null && totalKopeks > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
            <dt className="text-text-muted">{UI_TEXT.bookingWidget.summary.total}</dt>
            <dd className="font-display text-lg font-semibold text-text">{UI_FMT.priceLabel(totalKopeks)}</dd>
          </div>
        ) : null}
      </dl>

      <Button
        type="button"
        variant="primary"
        size="lg"
        onClick={onSubmit}
        disabled={submitDisabled || submitLoading}
        className="mt-4 w-full"
      >
        {submitLoading
          ? UI_TEXT.bookingWidget.summary.submitting
          : ready
          ? UI_TEXT.bookingWidget.summary.submit
          : UI_TEXT.bookingWidget.summary.submitDisabled}
      </Button>

      {cancellationDeadlineHours && cancellationDeadlineHours > 0 ? (
        <p className="mt-3 text-[11px] text-text-muted">
          {UI_TEXT.bookingWidget.summary.freeCancelTemplate.replace("{hours}", String(cancellationDeadlineHours))} ·{" "}
          {UI_TEXT.bookingWidget.summary.freeCancelHint}
        </p>
      ) : null}
    </div>
  );
}
