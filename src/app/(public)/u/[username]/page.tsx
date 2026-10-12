import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Building2, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { PublicMasterProfilePage } from "@/features/public-profile/master/public-profile-page";
import { PublicStudioProfilePage } from "@/features/public-studio/public-studio-profile-page";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { buildProviderSchema, safeJsonLd } from "@/lib/seo/schema";
import { BRAND_OG_IMAGE, SITE_OPEN_GRAPH } from "@/lib/seo/page-metadata";
import { buildProviderDescription, buildProviderTitle } from "@/lib/seo/provider-meta";
import { PORTFOLIO_CATEGORY_INCLUDE, publicCategoryTitle } from "@/lib/feed/work-category";
import { targetReviewsWhere } from "@/lib/reviews/review-scope";
import { withQuery } from "@/lib/public-urls";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { getNonce } from "@/lib/csp/nonce";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";

type Props = {
  params: Promise<{ username: string }> | { username: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

type ReviewAuthor = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
};

type ReviewSnippet = {
  rating: number;
  text: string | null;
  createdAt: Date;
  author: ReviewAuthor | null;
};

function buildReviewAuthorName(author: ReviewAuthor | null): string | null {
  if (!author) return null;
  const display = author.displayName?.trim();
  if (display) return display;
  const combined = [author.firstName, author.lastName].filter(Boolean).join(" ").trim();
  return combined || null;
}

function mapReviewsForSchema(reviews: ReviewSnippet[]) {
  return reviews.map((review) => ({
    rating: review.rating,
    text: review.text ?? null,
    authorName: buildReviewAuthorName(review.author),
    createdAt: review.createdAt,
  }));
}

function PublicProfilePageSkeleton() {
  return (
    <div className="space-y-6">
      <HeroSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <ServicesSkeleton />
          <PortfolioSkeleton />
          <ReviewsSkeleton />
        </div>
        <div className="h-fit">
          <BookingSkeleton />
        </div>
      </div>
    </div>
  );
}

function ProviderNotFoundView({
  type,
  unpublished,
}: {
  type: "MASTER" | "STUDIO" | null;
  unpublished: boolean;
}) {
  const t = UI_TEXT.publicProfile.page;
  const isStudio = type === "STUDIO";

  const title = isStudio ? t.studioNotFound : t.masterNotFound;
  const desc = unpublished
    ? isStudio
      ? t.studioUnpublishedDesc
      : t.masterUnpublishedDesc
    : isStudio
      ? t.studioNotFoundDesc
      : t.masterNotFoundDesc;

  const Icon = isStudio ? Building2 : User;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <Icon className="mb-4 h-16 w-16 text-text-sec/40" aria-hidden />
      <h1 className="mb-2 text-2xl font-bold text-text-main">{title}</h1>
      <p className="mb-6 max-w-md text-sm text-text-sec">{desc}</p>
      <Button asChild>
        <Link href="/catalog">{t.goToCatalog}</Link>
      </Button>
    </div>
  );
}

async function findProviderForMeta(username: string) {
  return prisma.provider.findFirst({
    where: {
      OR: [
        { publicUsername: username },
        { publicUsernameAliases: { some: { username } } },
      ],
    },
    select: {
      id: true,
      name: true,
      publicUsername: true,
      isPublished: true,
      type: true,
      description: true,
      avatarUrl: true,
      address: true,
      district: true,
      geoLat: true,
      geoLng: true,
      ratingAvg: true,
      ratingCount: true,
      updatedAt: true,
      city: { select: { name: true } },
      services: PUBLIC_SERVICES_SELECT,
    },
  });
}

/**
 * Услуги для заголовка, описания и разметки: те, что видит посетитель
 * (включены и активны — как в `catalogVisibleProviderWhere`), в порядке показа.
 */
const PUBLIC_SERVICES_SELECT = {
  where: { isEnabled: true, isActive: true },
  orderBy: { sortOrder: "asc" },
  take: 10,
  select: {
    name: true,
    title: true,
    price: true,
    durationMin: true,
    globalCategory: PORTFOLIO_CATEGORY_INCLUDE,
  },
} as const;

type PublicServiceRow = {
  name: string;
  title: string | null;
  price: number;
  durationMin: number;
  globalCategory: Parameters<typeof publicCategoryTitle>[0];
};

/** Название — как на странице: своё у услуги, иначе название из справочника. */
function toMetaServices(services: PublicServiceRow[]) {
  return services.map((service) => ({
    name: service.title?.trim() || service.name,
    price: service.price,
    durationMin: service.durationMin,
    categoryTitle: publicCategoryTitle(service.globalCategory),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: raw } = await Promise.resolve(params);
  const username = normalizeUsername(raw);
  const provider = await findProviderForMeta(username);

  if (!provider || !provider.publicUsername) {
    return {
      title: UI_TEXT.pages.publicProfile.notFoundTitle,
      robots: { index: false, follow: false },
    };
  }

  const canonicalUsername = provider.publicUsername;
  const canonicalPath = `/u/${canonicalUsername}`;
  const baseUrl = resolvePublicAppUrl();
  const canonicalUrl = baseUrl ? `${baseUrl}${canonicalPath}` : canonicalPath;

  const metaInput = {
    name: provider.name,
    type: provider.type,
    description: provider.description,
    cityName: provider.city?.name ?? null,
    services: toMetaServices(provider.services),
  };
  const title = buildProviderTitle(metaInput);
  const description = buildProviderDescription(metaInput);

  // Превью-картинку отдаёт `/api/og/profile` только опубликованному профилю
  // (иначе 404). Страница по ссылке открывается и без публикации, поэтому
  // неопубликованному — общая картинка бренда (как в корневом layout), а не
  // ссылка, которая всегда ведёт в 404.
  const ogImagePath = provider.isPublished
    ? `/api/og/profile?username=${encodeURIComponent(canonicalUsername)}`
    : BRAND_OG_IMAGE.url;
  const ogImageUrl = baseUrl ? `${baseUrl}${ogImagePath}` : ogImagePath;
  const ogImage = provider.isPublished
    ? { url: ogImageUrl, width: 1200, height: 630, alt: provider.name }
    : { ...BRAND_OG_IMAGE, url: ogImageUrl };

  return {
    title,
    description,
    metadataBase: baseUrl ? new URL(baseUrl) : undefined,
    alternates: { canonical: canonicalPath },
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title,
      description,
      url: canonicalUrl,
      type: "profile",
      images: [ogImage],
    },
    twitter: {
      card: provider.isPublished ? "summary_large_image" : "summary",
      title,
      description,
      images: [ogImageUrl],
    },
    robots: provider.isPublished ? undefined : { index: false, follow: false },
  };
}

export default async function PublicUsernamePage({ params, searchParams }: Props) {
  const [nonce, resolvedParams, resolvedSearchParams] = await Promise.all([
    getNonce(),
    Promise.resolve(params),
    Promise.resolve(searchParams),
  ]);
  const { username: raw } = resolvedParams;
  const sp = resolvedSearchParams ?? {};
  const username = normalizeUsername(raw);

  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async (username: string) => {
        const [direct, alias] = await Promise.all([
          resolveProviderBySlugOrId({
            key: username,
            select: { id: true, publicUsername: true, isPublished: true, type: true },
          }),
          prisma.provider.findFirst({
            where: { publicUsernameAliases: { some: { username } } },
            select: { id: true, publicUsername: true, isPublished: true, type: true },
          }),
        ]);
        return direct ?? alias;
      },
    },
    username
  );

  if (result.status === "not-found") {
    const reason = result.reason;
    const isUnpublished = reason === "unpublished" || reason === "alias-unpublished";

    if (isUnpublished) {
      // Provider exists but is not published — quick lookup to get type for better UX
      const provider = await findProviderForMeta(username);
      return <ProviderNotFoundView type={provider?.type ?? null} unpublished />;
    }

    // Truly not found (missing or invalid username)
    return <ProviderNotFoundView type={null} unpublished={false} />;
  }

  if (result.status === "redirect") {
    const master = typeof sp.master === "string" ? sp.master : undefined;
    const legacyMasterId = typeof sp.masterId === "string" ? sp.masterId : undefined;
    const redirectUrl = withQuery(`/u/${result.username}`, {
      serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
      slotStartAt: typeof sp.slotStartAt === "string" ? sp.slotStartAt : undefined,
      master: master,
      masterId: master ? undefined : legacyMasterId,
    });
    if (redirectUrl === `/u/${username}`) notFound();
    permanentRedirect(redirectUrl);
  }

  const seoProvider = await prisma.provider.findUnique({
    where: { id: result.providerId },
    select: {
      id: true,
      name: true,
      publicUsername: true,
      type: true,
      description: true,
      address: true,
      geoLat: true,
      geoLng: true,
      ratingAvg: true,
      ratingCount: true,
      avatarUrl: true,
      city: { select: { name: true } },
      services: PUBLIC_SERVICES_SELECT,
    },
  });

  // Отзывы для разметки — по тому же правилу, что список на странице и рейтинг
  // (`targetReviewsWhere`: только неудалённые, инв. #17). Раньше мастер читал
  // `reviewsAbout` без фильтра удаления — снятый модерацией отзыв попадал в
  // разметку для поисковиков.
  const seoReviews = seoProvider
    ? await prisma.review.findMany({
        where: targetReviewsWhere(seoProvider.type === "STUDIO" ? "studio" : "provider", seoProvider.id),
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          rating: true,
          text: true,
          createdAt: true,
          author: {
            select: { displayName: true, firstName: true, lastName: true },
          },
        },
      })
    : [];

  const schema = seoProvider
    ? buildProviderSchema(
        {
          id: seoProvider.id,
          type: seoProvider.type,
          name: seoProvider.name,
          description: seoProvider.description ?? null,
          publicUsername: seoProvider.publicUsername ?? null,
          avatarUrl: seoProvider.avatarUrl ?? null,
          address: seoProvider.address ?? null,
          cityName: seoProvider.city?.name ?? null,
          geoLat: seoProvider.geoLat ?? null,
          geoLng: seoProvider.geoLng ?? null,
          ratingAvg: seoProvider.ratingAvg ?? 0,
          ratingCount: seoProvider.ratingCount ?? 0,
          services: toMetaServices(seoProvider.services),
          reviews: mapReviewsForSchema(seoReviews),
        },
        resolvePublicAppUrl()
      )
    : null;

  const bookingParams = {
    serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
    master: typeof sp.master === "string" ? sp.master : undefined,
    masterId: typeof sp.master === "string" ? undefined : typeof sp.masterId === "string" ? sp.masterId : undefined,
    slotStartAt: typeof sp.slotStartAt === "string" ? sp.slotStartAt : undefined,
  };

  if (result.providerType === "STUDIO") {
    return (
      <>
        {schema ? (
          <script
            nonce={nonce}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
          />
        ) : null}
        <Suspense fallback={<PublicProfilePageSkeleton />}>
          <PublicStudioProfilePage studioId={result.providerId} bookingParams={bookingParams} />
        </Suspense>
      </>
    );
  }

  const initialServiceId = typeof sp.serviceId === "string" ? sp.serviceId : null;
  const initialSlotStartAt = typeof sp.slotStartAt === "string" ? sp.slotStartAt : null;

  return (
    <>
      {schema ? (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ) : null}
      <Suspense fallback={<PublicProfilePageSkeleton />}>
        <PublicMasterProfilePage
          providerId={result.providerId}
          initialServiceId={initialServiceId}
          initialSlotStartAt={initialSlotStartAt}
        />
      </Suspense>
    </>
  );
}

