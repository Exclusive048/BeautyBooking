import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { PublicMasterProfileClient } from "@/features/public-profile/master/public-profile-client";
import { PublicStudioProfileClient } from "@/features/public-studio/public-studio-profile-client";

type Props = {
  params: { username: string };
};

export default async function PublicUsernamePage({ params }: Props) {
  const result = await resolvePublicUsername(
    {
      findProviderByUsername: async (username) =>
        prisma.provider.findUnique({
          where: { publicUsername: username },
          select: { id: true, publicUsername: true, isPublished: true, type: true },
        }),
      findAlias: async (username) =>
        prisma.publicUsernameAlias.findUnique({
          where: { username },
          select: { providerId: true },
        }),
      findProviderById: async (id) =>
        prisma.provider.findUnique({
          where: { id },
          select: { publicUsername: true, isPublished: true },
        }),
    },
    params.username
  );

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "redirect") {
    permanentRedirect(`/u/${result.username}`);
  }

  if (result.providerType === "STUDIO") {
    return <PublicStudioProfileClient studioId={result.providerId} />;
  }

  return <PublicMasterProfileClient providerId={result.providerId} />;
}
