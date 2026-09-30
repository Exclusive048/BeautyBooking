import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.pricing.trialPromo;
const P = UI_TEXT.pricing.launchPromo;

type Props = {
  scope: "master" | "studio";
  /** LAUNCH-PROMO-01: во время акции подарок — PREMIUM до 1 ноября, а не 30 дней. */
  launchPromo?: boolean;
};

/**
 * Promo block on /pricing announcing the 30-day PREMIUM trial. Server component
 * — caller decides via `getCurrentSubscriptionRow` whether to render at all
 * (anonymous + users without an active subscription on this scope only).
 */
export function TrialPromoBlock({ scope, launchPromo = false }: Props) {
  const description = launchPromo
    ? scope === "master"
      ? P.trialDescriptionMaster
      : P.trialDescriptionStudio
    : scope === "master"
      ? T.descriptionMaster
      : T.descriptionStudio;
  const titleBefore = launchPromo ? P.trialTitleBefore : T.titleBefore;
  const titleItalic = launchPromo ? P.trialTitleItalic : T.titleItalic;
  const eyebrow = launchPromo ? P.eyebrow : T.eyebrow;
  const disclaimer = launchPromo ? P.trialDisclaimer : T.disclaimer;

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] via-bg-card/50 to-primary-magenta/[0.08] p-8 text-center sm:p-10">
        <Sparkles
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 h-7 w-7 text-accent-text/30"
        />

        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text">
          {eyebrow}
        </p>
        <h2 className="mb-3 font-display text-2xl text-text-main lg:text-3xl">
          {titleBefore}{" "}
          <em className="font-display font-normal italic text-accent-text">{titleItalic}</em>
        </h2>
        <p className="mx-auto mb-6 max-w-xl leading-relaxed text-text-sec">{description}</p>

        <Button asChild variant="primary" size="lg">
          <Link href="/login">{T.cta}</Link>
        </Button>

        <p className="mx-auto mt-4 max-w-xl text-xs text-text-sec">{disclaimer}</p>
      </div>
    </section>
  );
}
