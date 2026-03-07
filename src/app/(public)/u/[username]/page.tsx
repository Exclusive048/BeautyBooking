import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { PublicMasterProfilePage } from "@/features/public-profile/master/public-profile-page";
import { PublicStudioProfilePage } from "@/features/public-studio/public-studio-profile-page";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { buildProviderSchema } from "@/lib/seo/schema";
import { withQuery } from "@/lib/public-urls";
import { SelectedServicesProvider } from "@/features/public-profile/master/selected-services-context";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { getNonce } from "@/lib/csp/nonce";
import { UI_TEXT } from "@/lib/ui/text";
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

function truncateText(text: string, maxLength = 160): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(maxLength - 1, 0)).trim()}…`;
}

function buildDescription(input: {
  name: string;
  type: "MASTER" | "STUDIO";
  description: string | null;
  tagline: string | null;
}): string {
  const base =
    input.description?.trim() ||
    input.tagline?.trim() ||
    (input.type === "STUDIO"
      ? UI_TEXT.pages.publicProfile.studioDescriptionFallback.replace("{name}", input.name)
      : UI_TEXT.pages.publicProfile.masterDescriptionFallback.replace("{name}", input.name));
  return truncateText(base, 160);
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
      tagline: true,
      avatarUrl: true,
      address: true,
      district: true,
      geoLat: true,
      geoLng: true,
      ratingAvg: true,
      ratingCount: true,
      updatedAt: true,
      services: {
        where: { isActive: true },
        select: { name: true, price: true, durationMin: true },
        take: 10,
      },
    },
  });
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

  const title = UI_TEXT.pages.publicProfile.titleTemplate.replace("{name}", provider.name);
  const description = buildDescription({
    name: provider.name,
    type: provider.type,
    description: provider.description,
    tagline: provider.tagline,
  });

  return {
    title,
    description,
    metadataBase: baseUrl ? new URL(baseUrl) : undefined,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "profile",
      images: provider.avatarUrl ? [provider.avatarUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: provider.avatarUrl ? [provider.avatarUrl] : undefined,
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
    notFound();
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
      district: true,
      geoLat: true,
      geoLng: true,
      ratingAvg: true,
      ratingCount: true,
      avatarUrl: true,
      services: {
        where: { isActive: true },
        select: { name: true, price: true, durationMin: true },
        take: 10,
      },
      reviewsAbout: {
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
      },
      studioProfile: {
        select: {
          reviews: {
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
          },
        },
      },
    },
  });

  const reviewsForSchema = seoProvider
    ? mapReviewsForSchema(
        seoProvider.type === "STUDIO"
          ? seoProvider.studioProfile?.reviews ?? []
          : seoProvider.reviewsAbout ?? []
      )
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
          district: seoProvider.district ?? null,
          geoLat: seoProvider.geoLat ?? null,
          geoLng: seoProvider.geoLng ?? null,
          ratingAvg: seoProvider.ratingAvg ?? 0,
          ratingCount: seoProvider.ratingCount ?? 0,
          services: seoProvider.services ?? [],
          reviews: reviewsForSchema,
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
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ) : null}
      <Suspense fallback={<PublicProfilePageSkeleton />}>
        <SelectedServicesProvider>
          <PublicMasterProfilePage
            providerId={result.providerId}
            initialServiceId={initialServiceId}
            initialSlotStartAt={initialSlotStartAt}
          />
        </SelectedServicesProvider>
      </Suspense>
    </>
  );
}

