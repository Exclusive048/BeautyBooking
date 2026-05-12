import { UI_TEXT } from "@/lib/ui/text";
import type { AvailabilityHint as AvailabilityHintData } from "@/lib/master/public-profile-view.service";

type Props = {
  hint: AvailabilityHintData;
  /** Provider timezone — used to localise "later" date labels. */
  timezone: string;
};

const T = UI_TEXT.publicProfile.hero;

function formatLaterDate(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(date);
}

/**
 * Compact "next free slot" chip rendered inline in the hero meta strip.
 * Three states — today / later / none — each with its own visual key:
 * green pulse for today, neutral for later, dim for none.
 */
export function AvailabilityHint({ hint, timezone }: Props) {
  if (hint.kind === "today") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {T.availableTodayTemplate.replace("{time}", hint.time)}
      </span>
    );
  }
  if (hint.kind === "later") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-sec">
        <span aria-hidden className="h-2 w-2 rounded-full bg-text-sec/50" />
        {T.availableLaterTemplate.replace("{date}", formatLaterDate(hint.dateKey, timezone))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-sec/70">
      <span aria-hidden className="h-2 w-2 rounded-full bg-text-sec/30" />
      {T.availableNone}
    </span>
  );
}
