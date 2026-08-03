import "server-only";

import { MediaEntityType, MediaKind } from "@prisma/client";

import { logError, logInfo } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";
import type { MediaPurgePayload } from "@/lib/queue/types";

/**
 * DELETION-02 (MEDIA-PURGE-ON-DELETE) — удаление медиа из ХРАНИЛИЩА при
 * удалении аккаунта/кабинета.
 *
 * ## Что чинится
 *
 * RKN-FIX-03-A закрыл строки, но не байты: удаление аккаунта анонимизировало
 * профиль, а объекты в бакете оставались. Для аватара это буквально фотография
 * лица, пережившая удаление человека, — самая заметная выжившая ПДн вне списка
 * юриста.
 *
 * ## Что покрывается, а что НЕТ (и почему)
 *
 * Чистятся ТОЛЬКО те виды, у которых нет открытого вопроса о контролёре:
 *   • `AVATAR` сущности `USER` — фото самого человека;
 *   • `AVATAR` / `PORTFOLIO` сущностей `MASTER` / `STUDIO` — материалы кабинета,
 *     который удаляется целиком.
 *
 * НЕ чистятся (едут за своими `POLICY_PENDING`-связями в карте диспозиций —
 * трогать их здесь значило бы принять за юриста решение, которое ему и
 * адресовано):
 *   • `CLIENT_CARD_PHOTO` → `clientCards`/`clientNotes`: мастер выступает
 *     отдельным оператором, вопрос открыт в RKN-FIX-03-B;
 *   • `MODEL_APPLICATION_PHOTO` → `modelApplications`;
 *   • `BOOKING_REFERENCE` и `CHAT_ATTACHMENT` → едут за `bookings` (у
 *     `ChatMessage` вообще нет прямой связи с `UserProfile` — он привязан к
 *     брони).
 *
 * ## Порядок и крах-восстановление
 *
 * Ловушка «строки исчезли раньше объектов» закрыта **снимком в payload**: джоба
 * несёт `storageKey` каждого объекта, а не только id. Поэтому она остаётся
 * рабочей, даже если строки к моменту обработки уже удалены, и идемпотентна —
 * повторный прогон удаляет те же ключи, а удаление уже удалённого объекта в S3
 * не ошибка. Порядок внутри джобы: **сначала объект, потом строка**; если
 * воркер умрёт посередине, оставшиеся строки укажут на уже удалённые объекты, и
 * повторная попытка просто доведёт дело до конца.
 */

/** Виды медиа, которые этот механизм имеет право удалять. */
export const PURGEABLE_KINDS: ReadonlySet<MediaKind> = new Set([
  MediaKind.AVATAR,
  MediaKind.PORTFOLIO,
]);

/**
 * Виды, намеренно НЕ удаляемые: у каждого есть открытый вопрос к юристу.
 * Экспортируется, чтобы тест мог пиннить именно исключения, а не только правило.
 */
export const POLICY_PENDING_KINDS: ReadonlySet<MediaKind> = new Set([
  MediaKind.CLIENT_CARD_PHOTO,
  MediaKind.MODEL_APPLICATION_PHOTO,
  MediaKind.BOOKING_REFERENCE,
  MediaKind.CHAT_ATTACHMENT,
]);

type AssetRef = { id: string; storageKey: string };

/**
 * Снимок медиа удаляемого ПОЛЬЗОВАТЕЛЯ: его собственные аватары.
 *
 * Берём по `createdByUserId` + `entityType: USER`: аватар, загруженный
 * человеком для своего профиля. Материалы кабинета собираются отдельно
 * (`collectProviderMedia`) — кабинет может пережить пользователя и наоборот.
 */
export async function collectAccountMedia(userId: string): Promise<AssetRef[]> {
  return prisma.mediaAsset.findMany({
    where: {
      createdByUserId: userId,
      entityType: MediaEntityType.USER,
      kind: { in: Array.from(PURGEABLE_KINDS) },
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  });
}

/** Снимок медиа удаляемого кабинета (мастер/студия): аватар + портфолио. */
export async function collectProviderMedia(
  entityType: MediaEntityType,
  entityId: string,
): Promise<AssetRef[]> {
  return prisma.mediaAsset.findMany({
    where: {
      entityType,
      entityId,
      kind: { in: Array.from(PURGEABLE_KINDS) },
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  });
}

/**
 * Обработчик джобы. Возвращает статистику; **бросает**, если хотя бы один
 * объект не удалился, — чтобы очередь отработала свои ретраи и, исчерпав их,
 * положила задачу в dead-letter (это и есть видимость провала, см.
 * COMPLIANCE-WRITE-OBSERVABILITY: третий writer того же класса).
 *
 * Обратите внимание на асимметрию с `runMediaCleanup`: там удаление объекта
 * best-effort, потому что речь о мусорных PENDING-загрузках. Здесь — наоборот:
 * недоудалённая ПДн должна быть громкой.
 */
export async function runMediaPurge(payload: MediaPurgePayload): Promise<{
  objectsDeleted: number;
  rowsDeleted: number;
  failures: number;
}> {
  const storage = getStorageProvider();
  let objectsDeleted = 0;
  let rowsDeleted = 0;
  const failedKeys: string[] = [];

  for (const asset of payload.assets) {
    try {
      // 1. Объект. Идемпотентно: удаление отсутствующего ключа — не ошибка.
      await storage.deleteObject(asset.storageKey);
      objectsDeleted += 1;
    } catch (error) {
      failedKeys.push(asset.storageKey);
      logError("Media purge: storage delete failed", {
        assetId: asset.id,
        reason: payload.reason,
        error: error instanceof Error ? error.message : String(error),
      });
      // Строку НЕ удаляем: она — единственный оставшийся указатель на объект,
      // который всё ещё лежит в бакете. Потерять её значит потерять его навсегда.
      continue;
    }

    // 2. Только после успешного удаления объекта — строка.
    const deleted = await prisma.mediaAsset.deleteMany({ where: { id: asset.id } });
    rowsDeleted += deleted.count;
  }

  logInfo("Media purge completed", {
    reason: payload.reason,
    requested: payload.assets.length,
    objectsDeleted,
    rowsDeleted,
    failures: failedKeys.length,
  });

  if (failedKeys.length > 0) {
    throw new Error(
      `Media purge incomplete: ${failedKeys.length}/${payload.assets.length} objects not deleted`,
    );
  }

  return { objectsDeleted, rowsDeleted, failures: 0 };
}
