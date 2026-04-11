import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  MapPin,
  Star,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicModelOffer } from "@/lib/model-offers/public.service";
import { ModelOfferApplyForm } from "@/features/model-offers/components/public-model-offer-apply";
import { UI_TEXT } from "@/lib/ui/text";

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const offer = await getPublicModelOffer(code);
  if (!offer) {
    return {
      title: UI_TEXT.pages.modelOffer.notFoundTitle,
      description: UI_TEXT.pages.modelOffer.notFoundDescription,
    };
  }

  return {
    title: UI_TEXT.pages.modelOffer.titleTemplate.replace("{service}", offer.service.title),
    description: UI_TEXT.pages.modelOffer.descriptionTemplate
      .replace("{name}", offer.master.name)
      .replace("{date}", offer.dateLocal)
      .replace("{start}", offer.timeRangeStartLocal)
      .replace("{end}", offer.timeRangeEndLocal),
  };
}

export default async function ModelOfferPage({ params }: PageProps) {
  const { code } = await params;
  const offer = await getPublicModelOffer(code);
  if (!offer) return notFound();

  const user = await getSessionUser();
  const loginHref = `/login?next=${encodeURIComponent(`/models/${offer.publicCode}`)}`;
  const isFree = offer.price === null || offer.price === 0;
  const priceLabel = isFree
    ? UI_TEXT.pages.models.priceFree
    : `${offer.price} ${UI_TEXT.common.currencyRub}`;

  return (
    <div className="min-h-dvh bg-background">
      {/* Subtle hero gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-pink-500/6 via-purple-500/3 to-transparent dark:from-pink-500/4 dark:via-purple-500/2"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
        {/* Back link */}
        <Link
          href="/models"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {UI_TEXT.pages.modelOffer.backToOffers}
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
          {/* ── Left column ── */}
          <div className="space-y-5">
            {/* Master card */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                  {offer.master.avatarUrl ? (
                    <Image
                      src={offer.master.avatarUrl}
                      alt={offer.master.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                      priority
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">
                      {offer.master.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {UI_TEXT.pages.modelOffer.masterLabel}
                  </p>
                  <h2 className="mt-0.5 text-xl font-bold text-foreground">
                    {offer.master.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
                      {offer.master.ratingAvg.toFixed(1)}
                      <span className="text-xs">({offer.master.ratingCount})</span>
                    </span>
                    {offer.master.city ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" aria-hidden />
                        {offer.master.city}
                      </span>
                    ) : null}
                  </div>

                  {offer.master.publicUsername ? (
                    <Link
                      href={`/u/${offer.master.publicUsername}`}
                      className="mt-2 inline-flex text-sm font-medium text-primary hover:opacity-80"
                    >
                      {UI_TEXT.pages.modelOffer.masterProfileCta}
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Service + price + badge */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    isFree
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {isFree ? UI_TEXT.pages.models.badgeFree : priceLabel}
                </span>
                {offer.service.category?.title ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {offer.service.category.title}
                  </span>
                ) : null}
              </div>

              <h1 className="text-2xl font-bold text-foreground">{offer.service.title}</h1>
              {offer.service.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {offer.service.description}
                </p>
              ) : null}

              {/* Info grid */}
              <div className="mt-5 grid gap-3 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {UI_TEXT.pages.modelOffer.dateTimeLabel}
                  </span>
                  <span className="font-medium text-foreground">
                    {offer.dateLocal}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden />
                    {UI_TEXT.pages.modelOffer.durationLabel}
                  </span>
                  <span className="font-medium text-foreground">
                    {offer.timeRangeStartLocal}–{offer.timeRangeEndLocal}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({offer.service.durationMin} {UI_TEXT.common.minutesShort})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {UI_TEXT.pages.modelOffer.priceLabel}
                  </span>
                  <span className="font-bold text-foreground">
                    {priceLabel}
                  </span>
                </div>
              </div>
            </section>

            {/* Requirements */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-base font-semibold text-foreground">
                {UI_TEXT.pages.modelOffer.requirementsTitle}
              </h3>
              {offer.requirements.length > 0 ? (
                <ul className="space-y-2">
                  {offer.requirements.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {UI_TEXT.pages.modelOffer.requirementsEmpty}
                </p>
              )}
            </section>
          </div>

          {/* ── Right column — Apply form (sticky on desktop) ── */}
          <aside className="lg:sticky lg:top-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">
                {UI_TEXT.pages.modelOffer.applyTitle}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {UI_TEXT.pages.modelOffer.applySubtitle}
              </p>
              <div className="mt-5">
                <ModelOfferApplyForm
                  offerCode={offer.publicCode}
                  userId={user?.id ?? null}
                  loginHref={loginHref}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
