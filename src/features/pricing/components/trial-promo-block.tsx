import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.pricing.trialPromo;

type Props = {
  scope: "master" | "studio";
};

/**
 * Promo block on /pricing announcing the 30-day PREMIUM trial. Server component
 * — caller decides via `getCurrentSubscriptionRow` whether to render at all
 * (anonymous + users without an active subscription on this scope only).
 */
export function TrialPromoBlock({ scope }: Props) {
  const description = scope === "master" ? T.descriptionMaster : T.descriptionStudio;

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 via-bg-card/50 to-primary-magenta/8 p-8 text-center sm:p-10">
        <Sparkles
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 h-7 w-7 text-primary/30"
        />

        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
          {T.eyebrow}
        </p>
        <h2 className="mb-3 font-display text-2xl text-text-main lg:text-3xl">
          {T.titleBefore}{" "}
          <em className="font-display font-normal italic text-primary">{T.titleItalic}</em>
        </h2>
        <p className="mx-auto mb-6 max-w-xl leading-relaxed text-text-sec">{description}</p>

        <Button asChild variant="primary" size="lg">
          <Link href="/login">{T.cta}</Link>
        </Button>

        <p className="mx-auto mt-4 max-w-xl text-xs text-text-sec">{T.disclaimer}</p>
      </div>
    </section>
  );
}
