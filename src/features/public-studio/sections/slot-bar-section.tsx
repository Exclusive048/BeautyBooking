import Link from "next/link";
import { CalendarPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { studioBookingUrl } from "@/lib/public-urls";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.publicStudio.slotBar;

type Props = {
  studioId: string;
};

/**
 * STUDIO-PUBLIC-PROFILE-A — slot-bar.
 *
 * Audit found NO studio-scope slot aggregation helper (`buildSlotsForDay`
 * is per-master only; no `getStudioFreeSlots` exists). Live "Сегодня
 * свободны N окон" requires either N parallel per-master calls (heavy
 * for first paint) or a new aggregator service.
 *
 * Per spec ("Studio public live slot aggregation" backlog), this bar
 * ships as a deep-link CTA without a live counter — the booking widget
 * at `/u/[username]/booking` resolves availability when the client
 * actually picks a service + day. Honest UX > fake live count.
 */
export async function StudioSlotBarSection({ studioId }: Props) {
  let studio = null;
  try {
    studio = await getStudioProfile(studioId);
  } catch (error) {
    logPublicStudioBlockError("slot-bar", error, [`/api/providers/${studioId}`]);
  }
  if (!studio || !studio.isPublished) return null;

  const href =
    studioBookingUrl(
      { id: studio.id, publicUsername: studio.publicUsername },
      undefined,
      "public-studio-slot-bar",
    ) ?? "#";

  return (
    <section className="rounded-2xl bg-brand-gradient p-4 text-white shadow-card md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-80">
              {T.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold md:text-base">{T.headline}</p>
            <p className="text-[11px] opacity-80 md:text-xs">{T.subline}</p>
          </div>
        </div>
        <Button asChild variant="secondary" size="md" className="shrink-0">
          <Link href={href}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {T.book}
          </Link>
        </Button>
      </div>
    </section>
  );
}
