import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { withQuery } from "@/lib/public-urls";

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
      ? `Запись онлайн в студию ${input.name}. Выберите услуги и свободное время.`
      : `Запись онлайн к мастеру ${input.name}. Выберите услуги и свободное время.`);
  return truncateText(base, 160);
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
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: raw } = await Promise.resolve(params);
  const username = normalizeUsername(raw);
  const provider = await findProviderForMeta(username);

  if (!provider || !provider.publicUsername) {
    return {
      title: "Запись онлайн | BeautyHub",
      robots: { index: false, follow: false },
    };
  }

  const canonicalUsername = provider.publicUsername;
  const canonicalPath = `/u/${canonicalUsername}`;
  const baseUrl = resolvePublicAppUrl();
  const canonicalUrl = baseUrl ? `${baseUrl}${canonicalPath}` : canonicalPath;

  const title = `${provider.name} — запись онлайн | BeautyHub`;
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
      type: "website",
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

export default async function PublicUsernameBookingPage({ params, searchParams }: Props) {
  const { username: raw } = await Promise.resolve(params);
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const username = normalizeUsername(raw);

  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async (username: string) =>
        prisma.provider.findFirst({
          where: {
            OR: [
              { publicUsername: username },
              { publicUsernameAliases: { some: { username } } },
            ],
          },
          select: { id: true, publicUsername: true, isPublished: true, type: true },
        }),
    },
    username
  );

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "redirect") {
    const redirectUrl = withQuery(`/u/${result.username}/booking`, {
      masterId: typeof sp.masterId === "string" ? sp.masterId : undefined,
      serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
    });
    permanentRedirect(redirectUrl);
  }

  if (result.providerType === "MASTER") {
    const redirectUrl = withQuery(`/u/${username}`, {
      serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
    });
    permanentRedirect(redirectUrl);
  }

  const initialMasterId = typeof sp.masterId === "string" ? sp.masterId : undefined;
  const initialServiceId = typeof sp.serviceId === "string" ? sp.serviceId : undefined;

  return (
    <Suspense fallback={null}>
      <StudioBookingFlow
        studioId={result.providerId}
        initialMasterId={initialMasterId}
        initialServiceId={initialServiceId}
      />
    </Suspense>
  );
}
