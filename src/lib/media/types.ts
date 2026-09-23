import type { MediaAsset, MediaEntityType, MediaKind } from "@prisma/client";

export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MEDIA_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MEDIA_PORTFOLIO_LIMIT = 20;

/**
 * SEC-17 — суммарный потолок хранилища на аккаунт.
 *
 * Штучные лимиты были только у портфолио (план) и аватара (замена). Фото
 * клиентской карточки ограничены тремя НА КАРТОЧКУ, а карточка заводится из
 * `clientKey`, который присылает сам вызывающий (`ensureClientCard` создаёт её
 * для любой невиданной идентичности), — то есть лимит обходится добавлением
 * карточек, и байтового учёта не было нигде.
 *
 * 10 ГБ — заведомо выше любого реального аккаунта: портфолио ограничено планом
 * (≤20 фото), а единственная неограниченная поверхность — фото карточек, где
 * после переупаковки sharp снимок весит 1–2 МБ; потолок покрывает порядка пяти
 * тысяч таких фото. Смысл не в тесноте, а в том, чтобы расход перестал быть
 * неограниченным сверху. Квота по тарифам — продуктовое решение, заведено в
 * BACKLOG (`MEDIA-STORAGE-QUOTA-BY-PLAN`).
 */
export const MEDIA_USER_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

export type AllowedMediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MediaAssetDto = {
  id: string;
  entityType: MediaEntityType;
  entityId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  url: string;
  cropX: number | null;
  cropY: number | null;
  cropWidth: number | null;
  cropHeight: number | null;
  createdAt: string;
};

/**
 * PWA-FIX-01 — единственная форма ссылки на байты ассета.
 *
 * Роут лежит в `src/app/api/media/file/[id]`, то есть id — ПОСЛЕДНИЙ сегмент.
 * Строка собиралась вручную в семи местах, и одно из них перепутало порядок
 * (`/api/media/<id>/file`, `client-cabinet/profile.service.ts`) — такой ссылки
 * нет ни в одном роуте, поэтому аватар клиента молча отдавал 404 и на экране
 * оставался плейсхолдер. Опечатка в литерале не ловится ни typecheck'ом, ни
 * гейтами; вызов функции — ловится.
 */
export function buildMediaFileUrl(assetId: string): string {
  return `/api/media/file/${assetId}`;
}

export function toMediaAssetDto(asset: MediaAsset): MediaAssetDto {
  return {
    id: asset.id,
    entityType: asset.entityType,
    entityId: asset.entityId,
    kind: asset.kind,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    originalFilename: asset.originalFilename,
    url: buildMediaFileUrl(asset.id),
    cropX: asset.cropX ?? null,
    cropY: asset.cropY ?? null,
    cropWidth: asset.cropWidth ?? null,
    cropHeight: asset.cropHeight ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function assetHasCrop(asset: Pick<MediaAssetDto, "cropX" | "cropY" | "cropWidth" | "cropHeight">): boolean {
  return (
    asset.cropX !== null &&
    asset.cropY !== null &&
    asset.cropWidth !== null &&
    asset.cropHeight !== null
  );
}

type CropFields = Pick<MediaAssetDto, "cropX" | "cropY" | "cropWidth" | "cropHeight">;

/**
 * CROP-PUBLIC-01 — версия области обрезки в ссылке: четыре доли с точностью
 * 1e-4 («5000-2500-3333-5000»). Нужна не серверу — он режет по сохранённой
 * области из БД, — а кэшам: ответ отдаётся как `immutable`, поэтому новая
 * область обязана давать новую ссылку.
 */
export function cropVersionToken(crop: CropFields): string {
  return [crop.cropX, crop.cropY, crop.cropWidth, crop.cropHeight]
    .map((value) => String(Math.round((value ?? 0) * 10_000)))
    .join("-");
}

/**
 * CROP-PUBLIC-01 — ссылка, по которой аватар показывают ВНЕ редактора
 * (`Provider.avatarUrl`, логотип сайта): при сохранённой области — вырезанная
 * сервером картинка (`/api/media/file/[id]/crop/[v]`), иначе исходник.
 *
 * До этого область хранилась, но снаружи редактора её не применял никто:
 * профиль мастера, карточка каталога, страница студии и шапка брали голую
 * ссылку на файл и показывали центр фото, а не выбранный кадр.
 */
export function buildAvatarDisplayUrl(asset: { id: string } & CropFields): string {
  const base = buildMediaFileUrl(asset.id);
  return assetHasCrop(asset) ? `${base}/crop/${cropVersionToken(asset)}` : base;
}
