import "server-only";
import { Prisma, type MobilePushApnsEnvironment, type MobilePushProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * MOBILE-B2 — push-токены нативного приложения (`MobilePushDevice`).
 *
 * Строка — одна УСТАНОВКА приложения (`X-Installation-Id`), привязанная к
 * пользователю и к семье сессии (SEC-13), под которой токен зарегистрирован:
 *  · повторный вход другим аккаунтом на том же телефоне переносит строку
 *    (upsert по установке) — прежний владелец push больше не получает;
 *  · тот же токен у другой установки (переустановка, восстановление из
 *    резервной копии) удаляется там — один телефон не получает push дважды;
 *  · выход и отзыв сессии («Где я вошёл», «Завершить остальные», удаление
 *    аккаунта) удаляют строки своих семей в той же транзакции, что и отзыв;
 *  · страховка на случай пропущенного пути отзыва — `loadDeliverableDevices`:
 *    строка, чья семья больше не активна, удаляется при отправке, а не
 *    получает push.
 * Сам токен нигде не логируется.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type RegisterPushDeviceInput = {
  userId: string;
  sessionFamilyId: string;
  installationId: string;
  provider: MobilePushProvider;
  token: string;
  apnsEnvironment: MobilePushApnsEnvironment | null;
  platform: string | null;
  appVersion: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function registerPushDevice(input: RegisterPushDeviceInput): Promise<void> {
  const fields = {
    userId: input.userId,
    sessionFamilyId: input.sessionFamilyId,
    provider: input.provider,
    token: input.token,
    apnsEnvironment: input.provider === "APNS" ? input.apnsEnvironment : null,
    platform: input.platform,
    appVersion: input.appVersion,
  };
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      await tx.mobilePushDevice.deleteMany({
        where: { provider: input.provider, token: input.token, NOT: { installationId: input.installationId } },
      });
      await tx.mobilePushDevice.upsert({
        where: { installationId: input.installationId },
        create: { installationId: input.installationId, ...fields },
        update: fields,
      });
    });

  try {
    await attempt();
  } catch (error) {
    // Две одновременные регистрации одной установки / одного токена: вторая
    // упирается в уникальность, повтор видит строку первой и обновляет её.
    if (!isUniqueViolation(error)) throw error;
    await attempt();
  }
}

/**
 * Отвязка установки по просьбе приложения (выключили уведомления, выход).
 * Только своя строка: чужой `X-Installation-Id` ничего не удалит. Идемпотентна.
 */
export async function unregisterPushDevice(userId: string, installationId: string): Promise<void> {
  await prisma.mobilePushDevice.deleteMany({ where: { userId, installationId } });
}

/** Отозваны конкретные семьи (выход, «Где я вошёл» → завершить). */
export async function unlinkPushDevicesOfFamilies(db: Db, userId: string, familyKeys: string[]): Promise<number> {
  if (familyKeys.length === 0) return 0;
  const result = await db.mobilePushDevice.deleteMany({
    where: { userId, sessionFamilyId: { in: familyKeys } },
  });
  return result.count;
}

/** «Завершить остальные»: всё, кроме семьи текущего входа (`null` — всё). */
export async function unlinkPushDevicesExceptFamily(
  db: Db,
  userId: string,
  keepFamilyId: string | null,
): Promise<number> {
  const result = await db.mobilePushDevice.deleteMany({
    where: keepFamilyId ? { userId, NOT: { sessionFamilyId: keepFamilyId } } : { userId },
  });
  return result.count;
}

export async function unlinkAllPushDevices(db: Db, userId: string): Promise<number> {
  const result = await db.mobilePushDevice.deleteMany({ where: { userId } });
  return result.count;
}

/** Дешёвая проверка перед постановкой задачи: нет устройств — нет задачи. */
export async function hasPushDevices(userId: string): Promise<boolean> {
  const row = await prisma.mobilePushDevice.findFirst({ where: { userId }, select: { id: true } });
  return row !== null;
}

export type DeliverableDevice = {
  id: string;
  provider: MobilePushProvider;
  token: string;
  apnsEnvironment: MobilePushApnsEnvironment | null;
};

/**
 * Устройства, которым push можно отправить сейчас: строки пользователя, чья
 * семья сессии жива (есть неотозванная неистёкшая строка `RefreshSession`).
 * Строки мёртвых семей удаляются тут же — это страховка: каждый путь отзыва и
 * так отвязывает свои установки, но push разлогиненному телефону хуже лишнего
 * запроса. `deviceIds` — сузить до устройств повтора.
 */
export async function loadDeliverableDevices(userId: string, deviceIds?: string[]): Promise<DeliverableDevice[]> {
  const rows = await prisma.mobilePushDevice.findMany({
    where: { userId, ...(deviceIds ? { id: { in: deviceIds } } : {}) },
    select: { id: true, provider: true, token: true, apnsEnvironment: true, sessionFamilyId: true },
  });
  if (rows.length === 0) return [];

  const familyIds = [...new Set(rows.map((row) => row.sessionFamilyId))];
  const live = await prisma.refreshSession.findMany({
    where: { userId, familyId: { in: familyIds }, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { familyId: true },
  });
  const liveFamilies = new Set(live.map((row) => row.familyId));

  const stale = rows.filter((row) => !liveFamilies.has(row.sessionFamilyId));
  if (stale.length > 0) {
    // Условие и по семье: установку, которую за эти миллисекунды привязали
    // заново (новый вход), удалять нельзя.
    await prisma.mobilePushDevice.deleteMany({
      where: {
        id: { in: stale.map((row) => row.id) },
        sessionFamilyId: { in: [...new Set(stale.map((row) => row.sessionFamilyId))] },
      },
    });
  }
  return rows
    .filter((row) => liveFamilies.has(row.sessionFamilyId))
    .map(({ id, provider, token, apnsEnvironment }) => ({ id, provider, token, apnsEnvironment }));
}

/**
 * Провайдер ответил «токена больше нет». Условие и по токену: если установка
 * за это время прислала новый токен, строка остаётся.
 */
export async function deleteInvalidPushDevices(devices: Array<{ id: string; token: string }>): Promise<number> {
  if (devices.length === 0) return 0;
  const result = await prisma.mobilePushDevice.deleteMany({
    where: { OR: devices.map((device) => ({ id: device.id, token: device.token })) },
  });
  return result.count;
}
