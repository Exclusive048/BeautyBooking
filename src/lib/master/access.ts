import { cache } from "react";
import { ProviderType, type Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type MasterProviderContext = {
  id: string;
  studioId: string | null;
};

/**
 * STUDIO-MASTER-PROFILES (этап 4, решение владельца 2026-09-27): у мастера
 * может быть несколько профилей — ЛИЧНЫЙ и профиль в студии (своя строка
 * `Provider` с `studioId` студии и тем же владельцем). Кабинет мастера — это
 * кабинет его личного профиля, и личный профиль один: тот, на который указывает
 * `MasterProfile` (у него `userId` и `providerId` уникальны).
 *
 * Раньше «свой» профиль искался как самый старый `Provider` типа MASTER
 * пользователя (а в ~15 местах — без порядка вовсе). Пока профиль был один,
 * это совпадало; при двух — кабинет мог открыться на студийном профиле (у него
 * нет `MasterProfile`, и оболочка кабинета отвечала бы 403). Поэтому личный
 * профиль ищется ТОЛЬКО через `MasterProfile`, и всем местам это условие
 * отдаётся одной функцией.
 */
export function personalMasterProviderWhere(userId: string): Prisma.ProviderWhereInput {
  return { type: ProviderType.MASTER, masterProfile: { is: { userId } } };
}

export const getCurrentMasterProviderContext = cache(
  async (userId: string): Promise<MasterProviderContext> => {
    const provider = await prisma.provider.findFirst({
      where: personalMasterProviderWhere(userId),
      select: { id: true, studioId: true },
    });

    if (!provider) {
      throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    }

    return provider;
  },
);

export async function getCurrentMasterProviderId(userId: string): Promise<string> {
  const provider = await getCurrentMasterProviderContext(userId);
  return provider.id;
}

export async function isCurrentMasterManagedByStudio(userId: string): Promise<boolean> {
  const provider = await prisma.provider.findFirst({
    where: personalMasterProviderWhere(userId),
    select: { studioId: true },
  });
  return Boolean(provider?.studioId);
}

export type StudioMasterProfile = {
  /** `Provider.id` профиля мастера в студии. */
  id: string;
  /** `Provider.id` студии (`Provider.studioId` профиля). */
  studioProviderId: string;
};

/**
 * Профили мастера в студиях — строки `Provider` типа MASTER того же владельца,
 * привязанные к студии и НЕ являющиеся личным профилем. До миграции разделения
 * студийную работу несёт сам личный профиль (у него `studioId` задан), и этот
 * список пуст — рабочие списки кабинета тогда совпадают с прежними.
 */
export const listStudioMasterProfiles = cache(
  async (userId: string): Promise<StudioMasterProfile[]> => {
    const rows = await prisma.provider.findMany({
      where: {
        ownerUserId: userId,
        type: ProviderType.MASTER,
        studioId: { not: null },
        masterProfile: { is: null },
      },
      select: { id: true, studioId: true },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .filter((row): row is { id: string; studioId: string } => row.studioId !== null)
      .map((row) => ({ id: row.id, studioProviderId: row.studioId }));
  },
);

export type MasterWorkProfiles = {
  personalId: string;
  studioProfiles: StudioMasterProfile[];
  /** Личный + студийные — для рабочих списков кабинета (записи, клиенты, отзывы, счётчики). */
  allIds: string[];
  /** Работает ли человек в студии — через студийный профиль или (до миграции) личным профилем. */
  worksInStudio: boolean;
};

/**
 * Все рабочие профили мастера. Рабочие списки кабинета (главная, расписание,
 * канбан, счётчики, клиенты, отзывы) показывают записи ВСЕХ профилей с пометкой
 * контекста (этап 3); личные разделы (услуги, страница, портфолио, настройки)
 * работают только с личным профилем.
 */
export const getMasterWorkProfiles = cache(
  async (userId: string): Promise<MasterWorkProfiles> => {
    const [personal, studioProfiles] = await Promise.all([
      getCurrentMasterProviderContext(userId),
      listStudioMasterProfiles(userId),
    ]);
    return {
      personalId: personal.id,
      studioProfiles,
      allIds: [personal.id, ...studioProfiles.map((profile) => profile.id)],
      worksInStudio: personal.studioId !== null || studioProfiles.length > 0,
    };
  },
);
