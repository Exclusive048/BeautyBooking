import Link from "next/link";
import { Sparkles } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** When set, title becomes "Пока нет предложений в {city}". */
  cityName?: string | null;
};

const T = UI_TEXT.models.empty;

/**
 * Educational empty state. We don't have a ModelOfferSubscription feature yet,
 * so the actions point at things the user can actually do: change city via the
 * topbar selector, or fall back to the regular catalog if they're not actually
 * looking for a model exchange.
 */
export function EmptyState({ cityName }: Props) {
  const title = cityName
    ? T.titleWithCity.replace("{city}", cityName)
    : T.titleNoCity;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-2xl border border-dashed border-border-subtle p-10 text-center sm:p-12">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="mb-3 font-display text-2xl text-text-main">{title}</h3>
        <p className="mx-auto mb-6 max-w-md leading-relaxed text-text-sec">
          {T.description}
        </p>

        {cityName ? (
          <p className="text-sm text-text-sec">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>↑</span>
              {T.changeCityHint}
            </span>
          </p>
        ) : null}

        <div className="mt-8 border-t border-border-subtle/50 pt-6">
          <p className="mb-3 text-sm text-text-sec">{T.fallbackPrompt}</p>
          <Link
            href="/catalog"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {T.fallbackLink} →
          </Link>
        </div>
      </div>
    </div>
  );
}
