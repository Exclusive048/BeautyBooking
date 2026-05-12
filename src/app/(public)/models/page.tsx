import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { CategoryFilter } from "@/features/model-offers/components/category-filter";
import { EducationalSections } from "@/features/model-offers/components/educational-sections";
import { EmptyState } from "@/features/model-offers/components/empty-state";
import { ModelsTopBlock } from "@/features/model-offers/components/models-top-block";
import { OfferCard } from "@/features/model-offers/components/offer-card";
import { listModelOfferFilters, listPublicModelOffers } from "@/lib/model-offers/public.service";
import { getServerCity } from "@/lib/cities/server-city";
import { getModelOfferUserState } from "@/lib/model-offers/user-state";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Для моделей — МастерРядом",
  description:
    "Услуги со скидкой за участие в практике мастера. Каждый оффер показывает время услуги, время на контент и фото.",
  alternates: { canonical: "/models" },
};

type PageProps = {
  searchParams: Promise<{
    categoryId?: string;
    page?: string;
  }>;
};

const T = UI_TEXT.models;

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function formatCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return T.list.countLabelOne.replace("{count}", String(count));
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return T.list.countLabelFew.replace("{count}", String(count));
  }
  return T.list.countLabelMany.replace("{count}", String(count));
}

function buildPageHref(input: { page: number; categoryId?: string }): string {
  const params = new URLSearchParams();
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/models?${query}` : "/models";
}

export default async function ModelsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const categoryId = resolvedParams?.categoryId?.trim() || undefined;
  const page = parsePage(resolvedParams?.page);
  const limit = 12;

  const currentCity = await getServerCity();

  const [{ categories }, offers, userState] = await Promise.all([
    listModelOfferFilters(),
    listPublicModelOffers({
      categoryId,
      cityId: currentCity?.id,
      page,
      limit,
    }),
    getModelOfferUserState(),
  ]);

  const cityName = currentCity?.name ?? null;
  const listTitle = cityName
    ? T.list.titleWithCity.replace("{city}", cityName)
    : T.list.titleAllCities;

  return (
    <MarketingLayout>
      <ModelsTopBlock userState={userState}>
        <EducationalSections />
      </ModelsTopBlock>

      <section id="offers" className="mx-auto max-w-[1280px] scroll-mt-20 px-4 py-12 lg:py-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl text-text-main lg:text-3xl">{listTitle}</h2>
          {offers.items.length > 0 ? (
            <p className="text-sm text-text-sec tabular-nums">{formatCount(offers.items.length)}</p>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className="mb-8">
            <CategoryFilter categories={categories} activeCategoryId={categoryId} />
          </div>
        ) : null}

        {offers.items.length === 0 ? (
          <EmptyState cityName={cityName} />
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {offers.items.map((offer) => (
                <OfferCard key={offer.publicCode} offer={offer} />
              ))}
            </div>

            {page > 1 || offers.nextPage ? (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {page > 1 ? (
                  <Button asChild variant="secondary">
                    <Link href={buildPageHref({ page: page - 1, categoryId })}>← Назад</Link>
                  </Button>
                ) : null}
                {offers.nextPage ? (
                  <Button asChild variant="secondary">
                    <Link href={buildPageHref({ page: offers.nextPage, categoryId })}>Вперёд →</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="bg-bg-card/50 py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-3 font-display text-2xl text-text-main">{T.forMasters.title}</h2>
          <p className="mx-auto mb-6 max-w-xl leading-relaxed text-text-sec">
            {T.forMasters.description}
          </p>
          <Button asChild variant="primary" size="lg">
            <Link href="/cabinet/master/model-offers">{T.forMasters.cta}</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
