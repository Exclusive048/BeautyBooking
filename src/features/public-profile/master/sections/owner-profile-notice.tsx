import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.page;

/**
 * FIX-MASTER-01 item 5 — rendered in place of the booking widget when the
 * viewer owns this profile. One phrase + one action (empty-state rule):
 * the owner can't book themself, so the affordance is a link back to the
 * cabinet instead of a widget that would 400 on submit.
 */
export function OwnerProfileNotice() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-center">
      <BadgeCheck className="mx-auto mb-2 h-8 w-8 text-primary/60" aria-hidden />
      <p className="font-display text-base text-text-main">{T.ownerViewTitle}</p>
      <p className="mt-1 text-sm text-text-sec">{T.ownerViewHint}</p>
      <Button asChild variant="secondary" size="md" className="mt-4">
        <Link href="/cabinet/master/profile">{T.ownerViewEditCta}</Link>
      </Button>
    </div>
  );
}
