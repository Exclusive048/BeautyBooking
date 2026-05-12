import { Sparkles } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.empty;

/**
 * Shown when the master has not published a single offer yet. Same shape
 * as the clients/reviews empty states — illustration → title → body.
 */
export function OfferEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-lg text-text-main">{T.offersTitle}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-sec">{T.offersBody}</p>
    </div>
  );
}
