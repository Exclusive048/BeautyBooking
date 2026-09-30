import "server-only";

import { ProviderType, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { computeProfileCompletion } from "@/lib/master/profile-completion";
import { personalMasterProviderWhere } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { resolveCatalogPresence } from "@/lib/providers/catalog-presence";
import { catalogPresenceConditions } from "@/lib/providers/catalog-visibility";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import {
  buildMasterSetupGuide,
  buildStudioSetupGuide,
  type SetupGuideDto,
} from "@/lib/onboarding/setup-guide-shared";

/**
 * SETUP-GUIDE-01 — факты для «Первых шагов» (`setup-guide-shared.ts`). Каждый
 * шаг читает то же правило, что и остальной продукт: профиль — правило
 * карточки заполненности (`computeProfileCompletion`), расписание и «в
 * каталоге» — `resolveCatalogPresence` / `catalogPresenceConditions` (из них
 * собран предикат каталога), активный мастер студии — `STUDIO_ACTIVE_MASTER_WHERE`.
 * Своих копий правил здесь нет.
 */

const SETUP_PROVIDER_SELECT = {
  id: true,
  name: true,
  tagline: true,
  avatarUrl: true,
  description: true,
  address: true,
  cityId: true,
  setupRulesConfirmedAt: true,
  setupGuideHiddenAt: true,
} as const;

/** Личный кабинет мастера: `null` — у пользователя его нет. */
export async function loadMasterSetupGuide(userId: string): Promise<SetupGuideDto | null> {
  const provider = await prisma.provider.findFirst({
    where: personalMasterProviderWhere(userId),
    select: { ...SETUP_PROVIDER_SELECT, owner: { select: { phone: true } } },
  });
  if (!provider) return null;

  const [servicesCount, portfolioCount, presence] = await Promise.all([
    prisma.service.count({ where: { providerId: provider.id, isEnabled: true, isActive: true } }),
    prisma.portfolioItem.count({ where: { masterId: provider.id } }),
    resolveCatalogPresence(provider.id),
  ]);

  const completion = computeProfileCompletion({
    header: { name: provider.name, tagline: provider.tagline, avatarUrl: provider.avatarUrl },
    contacts: { phone: provider.owner?.phone ?? null },
    about: { bio: provider.description },
    location: { address: provider.address, cityId: provider.cityId },
    servicesCount,
    portfolioCount,
  });

  return buildMasterSetupGuide({
    profile: completion.bySection.header && completion.bySection.contacts && completion.bySection.about,
    address: completion.bySection.location,
    services: completion.bySection.services,
    schedule: Boolean(presence && !presence.gaps.includes("schedule")),
    rules: provider.setupRulesConfirmedAt !== null,
    portfolio: completion.bySection.portfolio,
    catalog: Boolean(presence?.listed),
    hidden: provider.setupGuideHiddenAt !== null,
  });
}

/** Кабинет студии по её `Provider` (`studioId` — строка `Studio`, для приглашений). */
export async function loadStudioSetupGuide(input: {
  studioProviderId: string;
  studioId: string;
}): Promise<SetupGuideDto | null> {
  const provider = await prisma.provider.findUnique({
    where: { id: input.studioProviderId },
    select: SETUP_PROVIDER_SELECT,
  });
  if (!provider) return null;

  const activeMasterWhere = {
    studioId: provider.id,
    type: ProviderType.MASTER,
    ...STUDIO_ACTIVE_MASTER_WHERE,
  };
  const [servicesCount, portfolioCount, activeMasters, withServices, withSchedule, invitesPending, presence] =
    await Promise.all([
      prisma.service.count({ where: { providerId: provider.id, isEnabled: true, isActive: true } }),
      prisma.portfolioItem.count({ where: { masterId: provider.id } }),
      prisma.provider.count({ where: activeMasterWhere }),
      prisma.provider.count({
        where: {
          ...activeMasterWhere,
          masterServices: {
            some: { isEnabled: true, service: { providerId: provider.id, isEnabled: true, isActive: true } },
          },
        },
      }),
      prisma.provider.count({ where: { ...activeMasterWhere, ...catalogPresenceConditions().schedule } }),
      prisma.studioInvite.count({ where: { studioId: input.studioId, status: "PENDING" } }),
      resolveCatalogPresence(provider.id),
    ]);

  const completion = computeProfileCompletion({
    header: { name: provider.name, tagline: provider.tagline, avatarUrl: provider.avatarUrl },
    // Контакты студии в шаг «Профиль» не входят — у шага свой набор полей ниже.
    contacts: { phone: null },
    about: { bio: provider.description },
    location: { address: provider.address, cityId: provider.cityId },
    servicesCount,
    portfolioCount,
  });

  return buildStudioSetupGuide({
    profile: completion.bySection.header && completion.bySection.about,
    address: completion.bySection.location,
    services: completion.bySection.services,
    activeMasters,
    invitesPending,
    mastersWithoutServices: activeMasters - withServices,
    mastersWithoutSchedule: activeMasters - withSchedule,
    rules: provider.setupRulesConfirmedAt !== null,
    portfolio: completion.bySection.portfolio,
    catalog: Boolean(presence?.listed),
    hidden: provider.setupGuideHiddenAt !== null,
  });
}

/**
 * Студия, чьи «Первые шаги» видит пользователь: открытая в кабинете
 * (`resolveCurrentStudioAccess`) и только для владельца или администратора;
 * `null` — студии нет или человек в ней мастер.
 */
export async function resolveSetupGuideStudio(
  userId: string,
): Promise<{ providerId: string; studioId: string } | null> {
  try {
    const access = await resolveCurrentStudioAccess(userId);
    const administers = access.roles.includes(StudioRole.OWNER) || access.roles.includes(StudioRole.ADMIN);
    return administers ? { providerId: access.providerId, studioId: access.studioId } : null;
  } catch (error) {
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  }
}

/** «Первые шаги» всех кабинетов пользователя — для основного профиля. */
export async function loadMySetupGuides(userId: string): Promise<SetupGuideDto[]> {
  const [master, studio] = await Promise.all([
    loadMasterSetupGuide(userId),
    resolveSetupGuideStudio(userId).then((found) =>
      found ? loadStudioSetupGuide({ studioProviderId: found.providerId, studioId: found.studioId }) : null,
    ),
  ]);
  return [master, studio].filter((guide): guide is SetupGuideDto => guide !== null);
}

export type SetupGuideAction = "confirmRules" | "hide" | "show";

/** «Правила записи — всё подходит», «Скрыть» карточку и вернуть её (из профиля). */
export async function updateSetupGuide(providerId: string, action: SetupGuideAction): Promise<void> {
  const now = new Date();
  await prisma.provider.update({
    where: { id: providerId },
    data:
      action === "confirmRules"
        ? { setupRulesConfirmedAt: now }
        : { setupGuideHiddenAt: action === "hide" ? now : null },
  });
}
