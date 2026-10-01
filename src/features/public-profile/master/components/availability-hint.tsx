import * as UI_TEXT from "@/lib/ui/text";
import type { AvailabilityHint as AvailabilityHintData } from "@/lib/master/public-profile-view.service";
import { UI_FMT } from "@/lib/ui/fmt";

type Props = {
  hint: AvailabilityHintData;
};

const T = UI_TEXT.publicProfile.hero;

// `dateKey` — уже дата салона (`toLocalDateKey` на сервере): подпись — по ключу.
function formatLaterDate(dateKey: string): string {
  return UI_FMT.dateKey(dateKey, "dayMonthLong");
}

/**
 * Compact "next free slot" chip rendered inline in the hero meta strip.
 * Three states — today / later / none — each with its own visual key:
 * green pulse for today, neutral for later, dim for none.
 */
export function AvailabilityHint({ hint }: Props) {
  if (hint.kind === "today") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-text">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-success/70" />
          <span className="relative h-2 w-2 rounded-full bg-success" />
        </span>
        {T.availableTodayTemplate.replace("{time}", hint.time)}
      </span>
    );
  }
  if (hint.kind === "later") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-sec">
        <span aria-hidden className="h-2 w-2 rounded-full bg-text-sec/50" />
        {T.availableLaterTemplate.replace("{date}", formatLaterDate(hint.dateKey))}
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
