import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FIX-STUDIO-02 (known-open 1 + owner parity) — the floating bottom-right
 * affordance. It used to be a «Записаться онлайн»-labelled button that merely
 * scrolled to `#studio-services` (a booking-labelled anchor that doesn't book —
 * one of the three confusing top-level CTAs). Now it's an honest «К услугам»
 * scroll, styled as a secondary (navigation, not the primary book action), and
 * hidden entirely for the owner, who can't book.
 */
export async function StudioStickyCta({ studioId }: { studioId: string }) {
  const isOwner = await isViewerProfileOwner(studioId);
  if (isOwner) return null;
  return (
    <Button
      asChild
      variant="secondary"
      className="fixed bottom-5 right-5 z-20 rounded-full px-5 py-3 shadow-hover"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <Link href="#studio-services">{UI_TEXT.publicStudio.toServices}</Link>
    </Button>
  );
}
