import { AlertTriangle } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  count: number;
};

const T = UI_TEXT.adminPanel.cities.providersWithoutCity;

/** Yellow-amber info card at the top of the page when one or more
 * providers exist without a `cityId` link. Hidden when count = 0. */
export function ProvidersWithoutCityCard({ count }: Props) {
  if (count <= 0) return null;
  const hint =
    count === 1
      ? T.hintSingle
      : T.hintPlural.replace("{count}", String(count));
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div>
        <p className="text-sm font-medium text-text-main">{T.title}</p>
        <p className="mt-0.5 text-xs text-text-sec">{hint}</p>
      </div>
    </div>
  );
}
