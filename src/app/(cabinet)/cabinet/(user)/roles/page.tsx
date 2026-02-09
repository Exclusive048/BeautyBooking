import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { RoleCardMaster } from "@/features/cabinet/roles/role-card-master";
import { RoleCardStudio } from "@/features/cabinet/roles/role-card-studio";
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

      <div className="grid gap-4 md:grid-cols-2">
        {me.hasMasterProfile && masterData ? (
          <RoleCardMaster mode="active" data={masterData} />
        ) : (
          <RoleCardMaster
            mode="empty"
            actionLabel="Создать мастера"
            actionHref={createMasterHref}
          />
        )}

        {me.hasStudioProfile && studioData ? (
          <RoleCardStudio mode="active" data={studioData} />
        ) : me.hasMasterProfile ? (
          <RoleCardStudio
            mode="upsell"
            actionLabel="Создать студию"
            actionHref={createStudioHref}
          />
        ) : (
          <RoleCardStudio
            mode="empty"
            actionLabel="Создать студию"
            actionHref={createStudioHref}
          />
        )}
      </div>
    </div>
  );
}
