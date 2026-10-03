import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { buildMediaFileUrl } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";

/**
 * Аватар клиента: последний загруженный USER-аватар (`/api/media/file/{id}`,
 * приватный — отдаётся только с сессией, без кропа), иначе фото от провайдера
 * входа (`externalPhotoUrl`, абсолютный URL), иначе `null`.
 *
 * Одно правило на кабинетный профиль (`getClientProfile` → `avatar.url`) и
 * `GET /api/me` (`avatarUrl`, MOBILE-CLIENT-01) — раньше функция жила внутри
 * `profile.service.ts`.
 *
 * MOBILE-CLIENT-01 (профиль B1): удалённый ассет не считается. `DELETE
 * /api/media/{id}` — мягкое удаление (`deletedAt`), статус остаётся `READY`,
 * поэтому без `deletedAt: null` после удаления аватара профиль продолжал
 * указывать на удалённый файл — 404 на картинке вместо фото от провайдера.
 */
export async function resolveClientAvatarUrl(
  userId: string,
  externalPhotoUrl: string | null,
): Promise<string | null> {
  return (await findClientAvatarFileUrl(userId)) ?? externalPhotoUrl;
}

/**
 * Только загруженный аватар (без запасного `externalPhotoUrl`) — чтобы
 * вызывающий мог читать его параллельно с профилем (`getMeIdentityFromDb`).
 */
export async function findClientAvatarFileUrl(userId: string): Promise<string | null> {
  const avatarAsset = await prisma.mediaAsset.findFirst({
    where: {
      entityType: MediaEntityType.USER,
      entityId: userId,
      kind: MediaKind.AVATAR,
      status: MediaAssetStatus.READY,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // PWA-FIX-01: путь именно `/api/media/file/<id>`. Форма `/api/media/<id>/file`
  // была единственной в дереве и роута такого нет (`src/app/api/media/file/[id]`),
  // то есть аватар клиента отдавал 404 — «загрузили фото, а оно не показывается».
  return avatarAsset ? buildMediaFileUrl(avatarAsset.id) : null;
}
