import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { providerPublicUrl } from "@/lib/public-urls";

export type StudioShellInfo = {
  id: string;
  providerId: string;
  name: string;
  avatarUrl: string | null;
  mastersCount: number;
  publicHref: string | null;
};

/**
 * Resolves the minimal studio descriptor surfaced by the cabinet shell:
 * display name, masters count for the topbar chip, and a public-page
 * URL (null when the studio has no published username). Avoids the
 * legacy HTTP roundtrip through `/api/providers/me` — both reads run
 * directly against Prisma.
 */
export async function getStudioShellInfo(studioId: string): Promise<StudioShellInfo | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: {
      id: true,
      providerId: true,
      provider: {
        select: { id: true, name: true, avatarUrl: true, publicUsername: true },
      },
    },
  });
  if (!studio) return null;

  const mastersCount = await prisma.provider.count({
    where: { type: ProviderType.MASTER, studioId: studio.providerId },
  });

  const publicHref = studio.provider.publicUsername
    ? providerPublicUrl(
        { id: studio.provider.id, publicUsername: studio.provider.publicUsername },
        "studio-cabinet",
      )
    : null;

  return {
    id: studio.id,
    providerId: studio.providerId,
    name: studio.provider.name,
    avatarUrl: studio.provider.avatarUrl ?? null,
    mastersCount,
    publicHref,
  };
}

