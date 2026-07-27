import { Package, Clock, Sparkles } from "lucide-react";
import type { PublicBundleView } from "@/lib/master/public-profile-view.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { PackageBookingButton } from "@/features/public-profile/master/components/package-booking-flow";

type Props = {
  bundle: PublicBundleView;
  providerId: string;
  providerTimezone: string;
  /** PACKAGE-SOLO-WIZARD-01: the master's between-bookings buffer — the package wizard's cursor gap. */
  providerBufferMin: number;
  /** PACKAGE-BOOKING-MVP-1: solo master only (studio masters book via studio). */
  bookable: boolean;
};

const T = UI_TEXT.publicProfile.bundles;

/**
 * Bundle preview card. PACKAGE-BOOKING-MVP-1: when `bookable` (solo master),
 * the card carries a "Записаться на пакет" CTA opening the atomic sequential
 * package-booking flow. Otherwise it stays informational (studio packages →
 * MVP-2).
 */
export function BundleCard({
  bundle,
  providerId,
  providerTimezone,
  providerBufferMin,
  bookable,
}: Props) {
  const savings = bundle.discountAmount > 0 ? UI_FMT.priceLabel(bundle.discountAmount) : null;
  return (
    <article className="bg-brand-gradient-soft relative overflow-hidden rounded-2xl border border-border-subtle/70 p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-2xl"
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-bg-card/85 text-accent-text">
            <Package className="h-4 w-4" aria-hidden strokeWidth={1.6} />
          </span>
          <h3 className="font-display text-base text-text-main">{bundle.name}</h3>
        </div>

        <div className="mb-4 text-xs uppercase tracking-wider text-text-sec">
          {T.includesLabel}
        </div>
        <ul className="mb-4 space-y-1.5">
          {bundle.serviceNames.map((name) => (
            <li key={name} className="flex items-center gap-2 text-sm text-text-main">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              {name}
            </li>
          ))}
        </ul>

        <div className="mb-3 flex items-end justify-between gap-3 border-t border-border-subtle/70 pt-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-sec">
              {T.finalPriceLabel}
            </div>
            <div className="font-display text-xl text-text-main">
              {UI_FMT.priceLabel(bundle.finalPrice)}
            </div>
            {savings ? (
              <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-text">
                <Sparkles className="h-3 w-3" aria-hidden strokeWidth={1.8} />
                {T.youSaveTemplate.replace("{amount}", savings)}
              </div>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-card/85 px-2.5 py-1 text-xs text-text-sec">
            <Clock className="h-3 w-3" aria-hidden strokeWidth={1.8} />
            {T.durationTemplate.replace("{minutes}", String(bundle.totalDurationMin))}
          </div>
        </div>

        {bookable ? (
          <PackageBookingButton
            bundle={bundle}
            providerId={providerId}
            providerTimezone={providerTimezone}
            providerBufferMin={providerBufferMin}
          />
        ) : (
          <p className="text-[11px] leading-relaxed text-text-sec/85">
            <span className="font-medium text-text-sec">{T.bookingComingSoon}.</span>{" "}
            {T.bookingComingSoonDesc}
          </p>
        )}
      </div>
    </article>
  );
}
