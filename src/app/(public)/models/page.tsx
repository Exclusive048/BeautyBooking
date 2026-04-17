import Link from "next/link";
import type { Metadata } from "next";
import { listModelOfferFilters, listPublicModelOffers } from "@/lib/model-offers/public.service";
import { ModelsHero } from "@/features/model-offers/components/models-hero";
import { ModelsFilterChips } from "@/features/model-offers/components/models-filter-chips";
import { ModelOfferCard } from "@/features/model-offers/components/model-offer-card";
import { ModelsEmptyState } from "@/features/model-offers/components/models-empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.models.title,
  description: UI_TEXT.pages.models.description,
  alternates: { canonical: "/models" },
};

type PageProps = {
  searchParams: Promise<{
    categoryId?: string;
    city?: string;
    page?: string;
  }>;
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
  return query ? `/models?${query}` : "/models";
}

export default async function ModelsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const categoryId = resolvedParams?.categoryId?.trim() || undefined;
  const city = resolvedParams?.city?.trim() || undefined;
  const page = parsePage(resolvedParams?.page);
  const limit = 12;

  const [{ categories, citySuggestions }, offers] = await Promise.all([
    listModelOfferFilters(),
    listPublicModelOffers({ categoryId, city, page, limit }),
  ]);

  const isFiltered = Boolean(categoryId || city);

  return (
    <div className="min-h-dvh bg-background">
      {/* Hero */}
      <ModelsHero />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {/* City search form */}
        <form
          method="get"
          action="/models"
          className="mb-6 flex items-end gap-3 rounded-2xl border border-border bg-card/80 p-4"
        >
          <label className="flex-1 text-xs font-medium text-muted-foreground">
            <span className="mb-1.5 block">{UI_TEXT.pages.models.cityLabel}</span>
            <Input
              name="city"
              list="model-offer-city-options"
              defaultValue={city ?? ""}
              placeholder={UI_TEXT.pages.models.cityPlaceholder}
            />
            <datalist id="model-offer-city-options">
              {citySuggestions.map((cityOption) => (
                <option key={cityOption} value={cityOption} />
              ))}
            </datalist>
          </label>
          {/* Preserve categoryId on city submit */}
          {categoryId ? (
            <input type="hidden" name="categoryId" value={categoryId} />
          ) : null}
          <Button type="submit" variant="primary" className="shrink-0">
            {UI_TEXT.pages.models.submit}
          </Button>
        </form>

        {/* Category filter chips */}
        {categories.length > 0 ? (
          <div className="mb-8">
            <ModelsFilterChips
              categories={categories}
              activeCategoryId={categoryId}
              city={city}
            />
          </div>
        ) : null}

        {/* Offer grid */}
        {offers.items.length === 0 ? (
          <ModelsEmptyState isFiltered={isFiltered} />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {offers.items.map((offer, i) => (
                <ModelOfferCard key={offer.publicCode} offer={offer} index={i} />
              ))}
            </div>

            {/* Pagination */}
            {(page > 1 || offers.nextPage) ? (
              <div className="mt-10 flex items-center justify-center gap-3">
                {page > 1 ? (
                  <Link
                    href={buildPageHref({ page: page - 1, categoryId, city })}
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {UI_TEXT.pages.models.paginationPrev}
                  </Link>
                ) : null}
                {offers.nextPage ? (
                  <Link
                    href={buildPageHref({ page: offers.nextPage, categoryId, city })}
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {UI_TEXT.pages.models.paginationNext}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
