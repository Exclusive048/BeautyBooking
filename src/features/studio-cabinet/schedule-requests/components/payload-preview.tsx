import * as UI_TEXT from "@/lib/ui/text";
import type { DayPreview, ReviewPreview, SchedulePayloadPreview } from "../lib/payload-display";

type Props = {
  preview: SchedulePayloadPreview;
  /** Открытая заявка: график сейчас и дни «было → стало». */
  review?: ReviewPreview | null;
};

const T = UI_TEXT.studioCabinet.scheduleRequests.preview;

const SECTION_TITLE = "mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-sec";
const ROW = "flex items-baseline gap-2 rounded-lg border border-border-subtle bg-bg-input/40 px-2.5 py-1.5";

function WeekBlock({ week }: { week: DayPreview[] }) {
  return (
    <div>
      <div className={SECTION_TITLE}>{T.weekTitle}</div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {week.map((day) => (
          <li key={day.weekdayLabel} className={ROW}>
            <span className="w-6 shrink-0 text-xs font-semibold text-text-sec">{day.weekdayLabel}</span>
            <span className={day.isWorkday ? "text-sm text-text-main" : "text-sm text-text-sec"}>{day.summary}</span>
            {day.breaks.length > 0 ? (
              <span className="ml-auto text-xs text-text-sec">
                {T.breaksLabel}: {day.breaks.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatternBlock({ pattern }: { pattern: { summary: string; period: string; days: string[] } }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-sec">{T.patternTitle}</div>
      <p className="text-sm font-medium text-text-main">{pattern.summary}</p>
      <p className="text-xs text-text-sec">{pattern.period}</p>
      {pattern.days.length > 0 ? (
        <ul className="space-y-0.5 text-sm text-text-main">
          {pattern.days.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** «Сейчас: …» — график, который заявка заменит. */
function CurrentLine({ current }: { current: string }) {
  return (
    <p className="text-sm text-text-sec">
      <span className="font-medium text-text-main">{T.currentLabel}:</span> {current}
    </p>
  );
}

function ReviewDays({ days }: { days: ReviewPreview["days"] }) {
  return (
    <div>
      <div className={SECTION_TITLE}>{T.daysTitle}</div>
      <ul className="space-y-1.5" data-testid="schedule-request-review-days">
        {days.map((day) => (
          <li key={day.date} className={`${ROW} flex-wrap`}>
            <span className="w-14 shrink-0 text-xs font-semibold text-text-sec">{day.date}</span>
            <span className="text-sm text-text-sec line-through decoration-text-sec/50">{day.before}</span>
            <span className="text-sm text-text-sec" aria-label={T.arrowAria}>
              →
            </span>
            <span className="text-sm font-medium text-text-main">{day.after}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PayloadPreview({ preview, review = null }: Props) {
  if (preview.format === "CHANGES_V1") {
    const replacesSchedule = preview.pattern !== null || preview.week !== null;
    return (
      <div className="space-y-3">
        {review?.current && replacesSchedule ? <CurrentLine current={review.current} /> : null}
        {preview.pattern ? <PatternBlock pattern={preview.pattern} /> : null}
        {preview.week ? <WeekBlock week={preview.week} /> : null}
        {review && review.days.length > 0 ? (
          <ReviewDays days={review.days} />
        ) : preview.dayCount > 0 ? (
          <p className="text-sm text-text-sec">{T.dayCount(preview.dayCount)}</p>
        ) : null}
      </div>
    );
  }

  if (preview.format === "EDITOR_V1") {
    return (
      <div className="space-y-3">
        <WeekBlock week={preview.week} />

        {preview.exceptions.length > 0 ? (
          <div>
            <div className={SECTION_TITLE}>{T.exceptionsTitle}</div>
            <ul className="space-y-1.5">
              {preview.exceptions.map((entry) => (
                <li key={entry.date} className={ROW}>
                  <span className="text-xs font-semibold text-text-sec">{entry.date}</span>
                  <span className={entry.isWorkday ? "text-sm text-text-main" : "text-sm text-text-sec"}>
                    {entry.summary}
                  </span>
                  {entry.note ? <span className="ml-auto text-xs text-text-sec">{entry.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (preview.format === "PATTERN_V1") {
    return (
      <div className="space-y-3">
        {review?.current ? <CurrentLine current={review.current} /> : null}
        <PatternBlock pattern={preview} />
      </div>
    );
  }

  if (preview.format === "LEGACY") {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-sec">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-sec">{T.legacyTitle}</div>
        {preview.summary}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-sec">
      {preview.summary}
    </div>
  );
}
