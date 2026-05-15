import { GitMerge, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  canonicalName: string;
  onMerge: () => void;
};

const T = UI_TEXT.adminPanel.cities.detail.duplicate;

/** Warning banner inside the detail panel — visible only when the
 * selected city is part of a duplicate group and is NOT the canonical
 * member. Tells the admin which city wins and offers a one-click
 * pre-filled merge dialog. */
export function CityDuplicateBanner({ canonicalName, onMerge }: Props) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          {T.title}
        </span>
      </div>
      <p className="mb-3 text-sm text-text-main">
        {T.description.replace("{canonicalName}", canonicalName)}
      </p>
      <Button variant="primary" size="sm" onClick={onMerge}>
        <GitMerge className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {T.mergeButton}
      </Button>
    </div>
  );
}
