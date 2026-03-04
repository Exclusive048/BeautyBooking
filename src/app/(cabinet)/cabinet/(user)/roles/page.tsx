import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { RolesCards } from "@/features/cabinet/roles/roles-cards";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getMeProfile } from "@/lib/users/profile";

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
          statusLabel: masterProvider.isPublished
            ? "Профиль опубликован"
            : "Профиль не опубликован",
          avatarUrl: masterProvider.avatarUrl,
          avatarFocalX: masterProvider.avatarFocalX ?? null,
          avatarFocalY: masterProvider.avatarFocalY ?? null,
          actionLabel: "Открыть кабинет",
          actionHref: masterCabinetHref,
        }
      : {
          name: "Профиль мастера",
          actionLabel: "Открыть кабинет",
          actionHref: masterCabinetHref,
        }
    : null;

  const studioMetrics = studioProvider
    ? [
        studioProvider._count.masters
          ? `Мастеров: ${studioProvider._count.masters}`
          : null,
        studioProvider.ratingCount
          ? `★ ${studioProvider.ratingAvg.toFixed(1)} (${studioProvider.ratingCount})`
          : null,
        studioProvider.isPublished ? "Опубликована" : "Черновик",
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
          actionLabel: "Открыть кабинет",
          actionHref: studioCabinetHref,
        }
      : {
          name: "Студия",
          actionLabel: "Открыть кабинет",
          actionHref: studioCabinetHref,
        }
    : null;

  return (
    <div className="space-y-6">
      <HeaderBlock
        title="Профессиональные роли"
        subtitle="Управляйте своим бизнесом или работой мастера"
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
