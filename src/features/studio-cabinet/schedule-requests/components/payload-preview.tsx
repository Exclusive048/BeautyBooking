import { UI_TEXT } from "@/lib/ui/text";
import type { SchedulePayloadPreview } from "../lib/payload-display";

type Props = {
  preview: SchedulePayloadPreview;
};

const T = UI_TEXT.studioCabinet.scheduleRequests.preview;

export function PayloadPreview({ preview }: Props) {
  if (preview.format === "EDITOR_V1") {
    return (
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-sec">
            {T.weekTitle}
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {preview.week.map((day) => (
              <li
                key={day.weekdayLabel}
                className="flex items-baseline gap-2 rounded-lg border border-border-subtle bg-bg-input/40 px-2.5 py-1.5"
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-text-sec">
                  {day.weekdayLabel}
                </span>
                <span
                  className={
                    day.isWorkday
                      ? "text-sm text-text-main"
                      : "text-sm text-text-sec"
                  }
                >
                  {day.summary}
                </span>
                {day.breaks.length > 0 ? (
                  <span className="ml-auto text-xs text-text-sec">
                    {T.breaksLabel}: {day.breaks.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {preview.exceptions.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-sec">
              {T.exceptionsTitle}
            </div>
            <ul className="space-y-1.5">
              {preview.exceptions.map((entry) => (
                <li
                  key={entry.date}
                  className="flex items-baseline gap-2 rounded-lg border border-border-subtle bg-bg-input/40 px-2.5 py-1.5"
                >
                  <span className="text-xs font-semibold text-text-sec">
                    {entry.date}
                  </span>
                  <span
                    className={
                      entry.isWorkday ? "text-sm text-text-main" : "text-sm text-text-sec"
                    }
                  >
                    {entry.summary}
                  </span>
                  {entry.note ? (
                    <span className="ml-auto text-xs text-text-sec">{entry.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (preview.format === "LEGACY") {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-sec">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-sec">
          {T.legacyTitle}
        </div>
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
