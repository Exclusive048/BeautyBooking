import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { RolesCards } from "@/features/cabinet/roles/roles-cards";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getMeProfile } from "@/lib/users/profile";
import { UI_TEXT } from "@/lib/ui/text";

const masterCabinetHref = "/cabinet/master";
const studioCabinetHref = "/cabinet/studio";
const createMasterHref = "/api/onboarding/professional/master";
const createStudioHref = "/api/onboarding/professional/studio";

export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const me = await getMeProfile(user.id);
  if (!me) redirect("/login");

  const masterProfile = me.hasMasterProfile
    ? await prisma.masterProfile.findUnique({
        where: { userId: user.id },
        select: {
          provider: {
            select: {
              name: true,
              avatarUrl: true,
              avatarFocalX: true,
              avatarFocalY: true,
              tagline: true,
              categories: true,
              ratingAvg: true,
              ratingCount: true,
              isPublished: true,
            },
          },
        },
      })
    : null;

  const studioProvider = me.hasStudioProfile
    ? await prisma.provider.findFirst({
        where: { ownerUserId: user.id, type: ProviderType.STUDIO },
        select: {
          name: true,
          avatarUrl: true,
          avatarFocalX: true,
          avatarFocalY: true,
          ratingAvg: true,
          ratingCount: true,
          isPublished: true,
          _count: { select: { masters: true } },
        },
      })
    : null;

  const masterProvider = masterProfile?.provider ?? null;
  const masterData = me.hasMasterProfile
    ? masterProvider
      ? {
          name: masterProvider.name,
          specialization: masterProvider.tagline || masterProvider.categories?.[0] || null,
          ratingAvg: masterProvider.ratingAvg,
          ratingCount: masterProvider.ratingCount,
          isPublished: masterProvider.isPublished,
          statusLabel: masterProvider.isPublished
            ? UI_TEXT.cabinetRolesPage.masterPublished
            : UI_TEXT.cabinetRolesPage.masterDraft,
          avatarUrl: masterProvider.avatarUrl,
          avatarFocalX: masterProvider.avatarFocalX ?? null,
          avatarFocalY: masterProvider.avatarFocalY ?? null,
          actionLabel: UI_TEXT.cabinetRolesPage.openCabinet,
          actionHref: masterCabinetHref,
        }
      : {
          name: UI_TEXT.cabinetRolesPage.masterProfileTitle,
          actionLabel: UI_TEXT.cabinetRolesPage.openCabinet,
          actionHref: masterCabinetHref,
        }
    : null;

  const studioMetrics = studioProvider
    ? [
        studioProvider._count.masters
          ? UI_TEXT.cabinetRolesPage.mastersCount.replace(
              "{count}",
              String(studioProvider._count.masters)
            )
          : null,
        studioProvider.ratingCount
          ? UI_TEXT.cabinetRolesPage.ratingTemplate
              .replace("{rating}", studioProvider.ratingAvg.toFixed(1))
              .replace("{count}", String(studioProvider.ratingCount))
          : null,
        studioProvider.isPublished
          ? UI_TEXT.cabinetRolesPage.studioPublished
          : UI_TEXT.cabinetRolesPage.studioDraft,
      ].filter((item): item is string => Boolean(item))
    : [];

  const studioData = me.hasStudioProfile
    ? studioProvider
      ? {
          name: studioProvider.name,
          logoUrl: studioProvider.avatarUrl,
          logoFocalX: studioProvider.avatarFocalX ?? null,
          logoFocalY: studioProvider.avatarFocalY ?? null,
          metrics: studioMetrics,
          actionLabel: UI_TEXT.cabinetRolesPage.openCabinet,
          actionHref: studioCabinetHref,
        }
      : {
          name: UI_TEXT.cabinetRolesPage.studioTitle,
          actionLabel: UI_TEXT.cabinetRolesPage.openCabinet,
          actionHref: studioCabinetHref,
        }
    : null;

  return (
    <div className="space-y-6">
      <HeaderBlock
        title={UI_TEXT.cabinetRolesPage.title}
        subtitle={UI_TEXT.cabinetRolesPage.subtitle}
      />

      <RolesCards
        hasMasterProfile={me.hasMasterProfile}
        hasStudioProfile={me.hasStudioProfile}
        masterData={masterData}
        studioData={studioData}
        createMasterHref={createMasterHref}
        createStudioHref={createStudioHref}
      />
    </div>
  );
}
