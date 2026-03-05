import Link from "next/link";
import type { Metadata } from "next";
import { listModelOfferFilterCategories, listPublicModelOffers } from "@/lib/model-offers/public.service";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.models.title,
  description: UI_TEXT.pages.models.description,
};

type PageProps = {
  searchParams?: {
    categoryId?: string;
    city?: string;
    page?: string;
  };
};

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function buildPageHref(input: {
  page: number;
  categoryId?: string;
  city?: string;
}): string {
  const params = new URLSearchParams();
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.city) params.set("city", input.city);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function ModelsPage({ searchParams }: PageProps) {
  const categoryId = searchParams?.categoryId?.trim() || undefined;
  const city = searchParams?.city?.trim() || undefined;
  const page = parsePage(searchParams?.page);
  const limit = 12;

  const [categories, offers] = await Promise.all([
    listModelOfferFilterCategories(),
    listPublicModelOffers({ categoryId, city, page, limit }),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10">
      <header className="mb-8 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-sec">{UI_TEXT.pages.models.brand}</p>
        <h1 className="text-3xl font-semibold text-text-main sm:text-4xl">{UI_TEXT.pages.models.heading}</h1>
        <p className="max-w-2xl text-sm text-text-sec">
          {UI_TEXT.pages.models.lead}
        </p>
      </header>

      <form className="mb-8 grid gap-3 rounded-3xl border border-border-subtle/80 bg-bg-card/70 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-sec">
          {UI_TEXT.pages.models.cityLabel}
          <input
            name="city"
            defaultValue={city ?? ""}
            placeholder={UI_TEXT.pages.models.cityPlaceholder}
            className="mt-2 w-full rounded-2xl border border-border/70 bg-bg-input px-4 py-2 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-text-sec">
          {UI_TEXT.pages.models.categoryLabel}
          <select
            name="categoryId"
            defaultValue={categoryId ?? ""}
            className="mt-2 w-full rounded-2xl border border-border/70 bg-bg-input px-4 py-2 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">{UI_TEXT.pages.models.categoryAll}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-11 rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
        >
          {UI_TEXT.pages.models.submit}
        </button>
      </form>

      {offers.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-subtle/80 bg-bg-card/50 p-10 text-center text-sm text-text-sec">
          {UI_TEXT.pages.models.empty}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {offers.items.map((offer) => (
            <Link
              key={offer.id}
              href={`/models/${offer.id}`}
              className="group flex h-full flex-col rounded-3xl border border-border-subtle/80 bg-bg-card/80 p-5 transition hover:border-primary/40 hover:shadow-card"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl border border-border-subtle/80 bg-bg-input">
                  {offer.master.avatarUrl ? (
                    <FocalImage
                      src={offer.master.avatarUrl}
                      alt=""
                      focalX={offer.master.avatarFocalX}
                      focalY={offer.master.avatarFocalY}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-text-sec">
                      {offer.master.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-main">{offer.master.name}</div>
                  <div className="text-xs text-text-sec">
                    {offer.master.city ?? UI_TEXT.pages.models.cityFallback} • ⭐{" "}
                    {offer.master.ratingAvg.toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-text-sec">
                {offer.service.category?.title ?? UI_TEXT.pages.models.categoryFallback}
              </div>
              <div className="mt-2 text-lg font-semibold text-text-main">{offer.service.title}</div>
              {offer.service.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-text-sec">{offer.service.description}</p>
              ) : null}

              <div className="mt-4 text-sm text-text-main">
                {offer.dateLocal} • {offer.timeRangeStartLocal}-{offer.timeRangeEndLocal}
              </div>
              <div className="mt-1 text-sm text-text-sec">
                {offer.price !== null
                  ? `${offer.price} ${UI_TEXT.common.currencyRub}`
                  : UI_TEXT.pages.models.priceFree}{" "}
                • {offer.service.durationMin} {UI_TEXT.common.minutesShort}
              </div>

              <div className="mt-auto pt-5 text-sm font-semibold text-primary">
                {UI_TEXT.pages.models.applyAction}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center justify-center gap-3">
        {page > 1 ? (
          <Link
            href={buildPageHref({ page: page - 1, categoryId, city })}
            className="rounded-2xl border border-border-subtle/80 bg-bg-card px-4 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
          >
            {UI_TEXT.pages.models.paginationPrev}
          </Link>
        ) : null}
        {offers.nextPage ? (
          <Link
            href={buildPageHref({ page: offers.nextPage, categoryId, city })}
            className="rounded-2xl border border-border-subtle/80 bg-bg-card px-4 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
          >
            {UI_TEXT.pages.models.paginationNext}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

