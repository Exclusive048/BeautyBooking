import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.account;

/**
 * Export-data placeholder. The real flow (queue job → JSON archive →
 * email link) is on the BACKLOG. This card sets expectations honestly
 * — the master sees the feature exists in plans without claiming it
 * works today.
 */
export function ExportCard() {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.exportHeading}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-sec">{T.exportBody}</p>
      <div className="mt-4">
        <Button variant="ghost" size="sm" disabled className="gap-1.5">
          <Download className="h-3.5 w-3.5" aria-hidden />
          {T.exportSoonCta}
        </Button>
      </div>
    </section>
  );
}
