import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { RolesCards } from "@/features/cabinet/roles/roles-cards";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveCatalogPresence, type CatalogPresence } from "@/lib/providers/catalog-presence";
import { getMeProfile } from "@/lib/users/profile";
import { UI_TEXT } from "@/lib/ui/text";

const masterCabinetHref = "/cabinet/master";
const studioCabinetHref = "/cabinet/studio";
const createMasterHref = "/api/onboarding/professional/master";
const createStudioHref = "/api/onboarding/professional/studio";

const CP = UI_TEXT.cabinet.catalogPresence;

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23): карточка роли говорит, есть ли
 * кабинет в каталоге и чего не хватает, — а не только «опубликован» (желание).
 */
function catalogStatusLabel(presence: CatalogPresence, type: "master" | "studio"): string {
  if (presence.listed) return CP.statusListed;
  if (presence.gaps.includes("hidden")) return CP.statusHidden;
  const labels = type === "studio" ? CP.gapsStudio : CP.gapsMaster;
  return `${CP.statusIncomplete}: ${presence.gaps.map((gap) => labels[gap]).join(", ")}`;
}

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
              id: true,
              name: true,
              avatarUrl: true,
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
          id: true,
          name: true,
          avatarUrl: true,
          ratingAvg: true,
          ratingCount: true,
          isPublished: true,
          _count: { select: { masters: true } },
        },
      })
    : null;

  const masterProvider = masterProfile?.provider ?? null;
  const [masterPresence, studioPresence] = await Promise.all([
    masterProvider ? resolveCatalogPresence(masterProvider.id) : Promise.resolve(null),
    studioProvider ? resolveCatalogPresence(studioProvider.id) : Promise.resolve(null),
  ]);
  const masterData = me.hasMasterProfile
    ? masterProvider
      ? {
          name: masterProvider.name,
          specialization: masterProvider.tagline || masterProvider.categories?.[0] || null,
          ratingAvg: masterProvider.ratingAvg,
          ratingCount: masterProvider.ratingCount,
          isPublished: masterPresence ? masterPresence.listed : masterProvider.isPublished,
          statusLabel: masterPresence
            ? catalogStatusLabel(masterPresence, "master")
            : masterProvider.isPublished
              ? UI_TEXT.cabinetRolesPage.masterPublished
              : UI_TEXT.cabinetRolesPage.masterDraft,
          avatarUrl: masterProvider.avatarUrl,
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
      ].filter((item): item is string => Boolean(item))
    : [];

  const studioData = me.hasStudioProfile
    ? studioProvider
      ? {
          name: studioProvider.name,
          logoUrl: studioProvider.avatarUrl,
          catalogStatus: studioPresence
            ? { label: catalogStatusLabel(studioPresence, "studio"), listed: studioPresence.listed }
            : {
                label: studioProvider.isPublished
                  ? UI_TEXT.cabinetRolesPage.studioPublished
                  : UI_TEXT.cabinetRolesPage.studioDraft,
                listed: studioProvider.isPublished,
              },
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
