import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { PublicMasterProfileClient } from "@/features/public-profile/master/public-profile-client";
import { PublicStudioProfileClient } from "@/features/public-studio/public-studio-profile-client";

type Props = {
  params: Promise<{ username: string }> | { username: string };
};

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export default async function PublicUsernamePage({ params }: Props) {
  const { username: raw } = await Promise.resolve(params);
  const username = normalizeUsername(raw);

  const result = await resolvePublicUsername(
    {
      findProviderByUsername: async (username: string) =>
        prisma.provider.findUnique({
          where: { publicUsername: username },
          select: { id: true, publicUsername: true, isPublished: true, type: true },
        }),
      findAlias: async (username: string) =>
        prisma.publicUsernameAlias.findUnique({
          where: { username },
          select: { providerId: true },
        }),
      findProviderById: async (id: string) =>
        prisma.provider.findUnique({
          where: { id },
          select: { publicUsername: true, isPublished: true, type: true },
        }),
    },
    username
  );

  if (process.env.NODE_ENV !== "production") {
    if (result.status === "not-found") {
      const reason =
        result.reason === "unpublished"
          ? "найден, но профиль не опубликован"
          : result.reason === "alias-unpublished"
            ? "найден алиас, но профиль не опубликован"
            : result.reason === "invalid"
              ? "некорректный username"
              : "username не найден";
      console.info(`[public] /u/${username} -> ${reason}`);
    }

    if (result.status === "redirect") {
      console.info(`[public] /u/${username} -> редирект по алиасу на /u/${result.username}`);
    }
  }

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "redirect") {
    // защита от редиректа в себя (на случай)
    if (result.username === username) notFound();
    permanentRedirect(`/u/${result.username}`);
  }

  if (result.providerType === "STUDIO") {
    return <PublicStudioProfileClient studioId={result.providerId} />;
  }

  return <PublicMasterProfileClient providerId={result.providerId} />;
}
