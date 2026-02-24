import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { withQuery } from "@/lib/public-urls";
import { looksLikeProviderId, resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

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
  const masterParam = typeof sp.master === "string" ? sp.master : undefined;
  const legacyMasterId = typeof sp.masterId === "string" ? sp.masterId : undefined;
  const serviceParam = typeof sp.serviceId === "string" ? sp.serviceId : undefined;

  async function resolveMasterSelection(studioId: string) {
    const key = masterParam ?? legacyMasterId;
    if (!key) return null;

    const master = await resolveProviderBySlugOrId({
      key,
      select: { id: true, publicUsername: true, type: true, studioId: true },
    });

    if (!master || master.type !== "MASTER" || master.studioId !== studioId) {
      return null;
    }

    return master;
  }

  if (looksLikeProviderId(username)) {
    const provider = await resolveProviderBySlugOrId({
      key: username,
      select: { id: true, publicUsername: true, isPublished: true, type: true },
    });

    if (!provider || !provider.isPublished) {
      notFound();
    }

    if (provider.type === "MASTER") {
      const redirectUrl = withQuery(`/u/${provider.publicUsername ?? username}`, {
        serviceId: serviceParam,
      });
      permanentRedirect(redirectUrl);
    }

    const studioSlug = provider.publicUsername ?? username;
    const master = await resolveMasterSelection(provider.id);
    const shouldRedirectStudio = provider.publicUsername && provider.publicUsername !== username;
    const shouldRedirectMaster =
      (!masterParam && legacyMasterId && master?.publicUsername) ||
      (masterParam &&
        looksLikeProviderId(masterParam) &&
        master?.publicUsername &&
        master.publicUsername !== masterParam);

    if (shouldRedirectStudio || shouldRedirectMaster) {
      const rest = { ...sp };
      delete rest.master;
      delete rest.masterId;
      const redirectUrl = withQuery(`/u/${studioSlug}/booking`, {
        ...rest,
        master: shouldRedirectMaster ? master?.publicUsername : masterParam,
        masterId: master && !master.publicUsername ? legacyMasterId : undefined,
      });
      permanentRedirect(redirectUrl);
    }

    const initialMasterId = master?.id;
    const initialServiceId = serviceParam;

    return (
      <Suspense fallback={null}>
        <StudioBookingFlow
          studioId={provider.id}
          initialMasterId={initialMasterId}
          initialServiceId={initialServiceId}
        />
      </Suspense>
    );
  }

  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async (username: string) => {
        const direct = await resolveProviderBySlugOrId({
          key: username,
          select: { id: true, publicUsername: true, isPublished: true, type: true },
        });
        if (direct) return direct;

        return prisma.provider.findFirst({
          where: { publicUsernameAliases: { some: { username } } },
          select: { id: true, publicUsername: true, isPublished: true, type: true },
        });
      },
    },
    username
  );

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "redirect") {
    const redirectUrl = withQuery(`/u/${result.username}/booking`, {
      master: masterParam,
      masterId: masterParam ? undefined : legacyMasterId,
      serviceId: serviceParam,
    });
    permanentRedirect(redirectUrl);
  }

  if (result.providerType === "MASTER") {
    const redirectUrl = withQuery(`/u/${username}`, {
      serviceId: serviceParam,
    });
    permanentRedirect(redirectUrl);
  }

  const master = await resolveMasterSelection(result.providerId);
  const shouldRedirectMaster =
    (!masterParam && legacyMasterId && master?.publicUsername) ||
    (masterParam &&
      looksLikeProviderId(masterParam) &&
      master?.publicUsername &&
      master.publicUsername !== masterParam);

  if (shouldRedirectMaster) {
    const rest = { ...sp };
    delete rest.master;
    delete rest.masterId;
    const redirectUrl = withQuery(`/u/${username}/booking`, {
      ...rest,
      master: master?.publicUsername,
    });
    permanentRedirect(redirectUrl);
  }

  const initialMasterId = master?.id;
  const initialServiceId = serviceParam;

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
