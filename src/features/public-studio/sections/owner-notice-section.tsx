import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicStudio;

/**
 * FIX-STUDIO-02 (owner parity) — the studio equivalent of the master-side
 * OwnerProfileNotice. Rendered only when the viewer owns this studio: the
 * self-booking guard (`booking-core.ts`) rejects the owner at submit, so every
 * booking CTA on the page is a guaranteed dead end. Reuses the shared
 * `isViewerProfileOwner` helper (checks `provider.ownerUserId === viewer`;
 * `studioId` here is the studio provider id, so it resolves the owner). One
 * phrase + one action → manage the studio.
 */
export async function StudioOwnerNotice({ studioId }: { studioId: string }) {
  const isOwner = await isViewerProfileOwner(studioId);
  if (!isOwner) return null;
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-center">
      <BadgeCheck className="mx-auto mb-2 h-8 w-8 text-primary/60" aria-hidden />
      <p className="font-display text-base text-text-main">{T.ownerViewTitle}</p>
      <p className="mt-1 text-sm text-text-sec">{T.ownerViewHint}</p>
      <Button asChild variant="secondary" size="md" className="mt-4">
        <Link href="/cabinet/studio">{T.ownerViewManageCta}</Link>
      </Button>
    </div>
  );
}
