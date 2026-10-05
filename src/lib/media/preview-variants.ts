import "server-only";

import sharp from "sharp";
import { Readable } from "stream";
import { logError } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/media/storage";
import type { StorageProvider } from "@/lib/media/storage/types";
import { prisma } from "@/lib/prisma";

/**
 * MOBILE-B1 — превью по ширине: `GET /api/media/file/{id}?w=<int>`.
 *
 * Нативное приложение показывает картинки списками (лента, каталог,
 * портфолио) и не должно качать оригинал до 2560 px (`MEDIA_MAX_IMAGE_SIDE_PX`)
 * в плитку шириной 160 CSS px. Веб этим не пользуется — у него `next/image`
 * со своим оптимизатором, — и без `w` роут отвечает ровно как раньше.
 *
 * ## Ширины — фиксированный набор, а не произвольное число
 *
 * Запрошенная ширина округляется ВВЕРХ до ближайшей из набора, выше 1280 —
 * до 1280. Отсюда ограниченность: на актив не больше шести вариантов, то есть
 * перебором `w` нельзя ни заставить сервер жать картинку бесконечно, ни
 * засыпать хранилище. Набор покрывает экран телефона: плитка в две колонки
 * (~180 CSS px × 3 DPR ≈ 540 → 640), карточка во всю ширину (390 × 3 → 1280).
 * Оригинал — без `w`.
 *
 * Мусорный `w` (не целое, ноль, отрицательное, `w=abc`) НЕ даёт 400: старые и
 * чужие клиенты вправе прислать что угодно, и правильный ответ им — оригинал,
 * как до появления параметра.
 *
 * Не-изображения (на всякий случай: сегодня в хранилище только jpeg/png/webp)
 * и сбой декодирования отдают оригинал — превью необязательная оптимизация,
 * а не условие показа.
 *
 * ## Кэш вариантов
 *
 * Обрезка (`crop/[v]`) режется на каждом запросе и живёт только в HTTP-кэше;
 * превью так нельзя — их на порядок больше (каждая плитка ленты). Поэтому
 * вариант пишется в то же хранилище рядом с оригиналом по детерминированному
 * ключу `<storageKey>.w<ширина>.webp` и генерируется один раз на пару (актив,
 * ширина). Ключ наследует случайную часть `storageKey` (uuid), то есть угадать
 * его не проще, чем ключ самого оригинала. Байты оригинала неизменны (новый
 * файл = новый актив), поэтому вариант не протухает.
 *
 * ## Удаление — вместе с оригиналом
 *
 * Вариант — производная ПДн (аватар — фото лица), и пережить оригинал он не
 * вправе: `deleteMediaPreviews` зовут оба удаляющих пути — `deleteAssetById`
 * (мягкое удаление) и `runMediaPurge` (удаление аккаунта/кабинета). Ключи
 * выводятся из `storageKey`, поэтому удаление не зависит от того, какие
 * варианты успели создать, — удаляется весь набор (отсутствующий ключ — успех).
 * Гонка «вариант записали после удаления» закрыта перепроверкой строки сразу
 * после записи: если актив уже удалён — вариант удаляется тут же; если ещё
 * нет — удаляющий путь снесёт его следом (он удаляет варианты ПОСЛЕ пометки).
 */
export const MEDIA_PREVIEW_WIDTHS = [160, 320, 480, 640, 960, 1280] as const;

export type MediaPreviewWidth = (typeof MEDIA_PREVIEW_WIDTHS)[number];

export const MEDIA_PREVIEW_QUERY_PARAM = "w";

const MEDIA_PREVIEW_CONTENT_TYPE = "image/webp";
/** Превью списков: 80 — заметно легче 90 у выреза аватара, артефакты на плитке не видны. */
const MEDIA_PREVIEW_WEBP_QUALITY = 80;
const PREVIEWABLE_MIME_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Больше шести цифр — заведомо мусор; не даём `Number()` разбирать километровую строку. */
const PREVIEW_WIDTH_PATTERN = /^\d{1,6}$/;

/** Ширина превью из `?w=`: округление вверх по набору; `null` — отдать оригинал. */
export function parseMediaPreviewWidth(raw: string | null | undefined): MediaPreviewWidth | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (!PREVIEW_WIDTH_PATTERN.test(value)) return null;
  const requested = Number(value);
  if (requested <= 0) return null;
  for (const width of MEDIA_PREVIEW_WIDTHS) {
    if (requested <= width) return width;
  }
  return MEDIA_PREVIEW_WIDTHS[MEDIA_PREVIEW_WIDTHS.length - 1];
}

export function isPreviewableMimeType(mimeType: string): boolean {
  return PREVIEWABLE_MIME_TYPES.has(mimeType);
}

export function mediaPreviewStorageKey(storageKey: string, width: MediaPreviewWidth): string {
  return `${storageKey}.w${width}.webp`;
}

/** Все возможные ключи вариантов актива — их удаляют вместе с оригиналом. */
export function mediaPreviewStorageKeys(storageKey: string): string[] {
  return MEDIA_PREVIEW_WIDTHS.map((width) => mediaPreviewStorageKey(storageKey, width));
}

/**
 * Уменьшение до ширины с сохранением пропорций. `withoutEnlargement` — мелкий
 * исходник не растягивается (вариант тогда той же ширины, только webp).
 * `.rotate()` — EXIF-ориентация, как на аплоаде (`capLongestSide`): у старых
 * файлов тег мог остаться, и браузер показывал оригинал повёрнутым по нему.
 */
export async function renderMediaPreview(source: Buffer, width: MediaPreviewWidth): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: MEDIA_PREVIEW_WEBP_QUALITY })
    .toBuffer();
}

/** Байты для ответа роута: поток из хранилища либо буфер, только что собранный. */
export type MediaBody = {
  body: ReadableStream | Uint8Array<ArrayBuffer>;
  sizeBytes: number;
  contentType: string;
};

type PreviewSourceAsset = { id: string; storageKey: string; mimeType: string };

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function bufferBody(bytes: Buffer, contentType: string): MediaBody {
  return { body: new Uint8Array(bytes), sizeBytes: bytes.length, contentType };
}

/**
 * Вариант записан, а актив тем временем удалили — вариант удаляется сразу.
 * Сбой самой проверки не роняет ответ: вариант тогда снесёт удаляющий путь
 * (он удаляет весь набор ключей после пометки строки).
 */
async function dropPreviewIfAssetGone(storage: StorageProvider, assetId: string, key: string): Promise<void> {
  const live = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { deletedAt: true },
  });
  if (!live || live.deletedAt) {
    await storage.deleteObject(key);
  }
}

type GeneratedPreview = { bytes: Buffer; contentType: string } | null;

/**
 * Генерация в процессе — одна на ключ: первая плитка ленты, запрошенная
 * сразу несколькими клиентами, не должна жать один и тот же оригинал N раз.
 */
const inflightPreviews = new Map<string, Promise<GeneratedPreview>>();

async function generatePreview(
  storage: StorageProvider,
  asset: PreviewSourceAsset,
  width: MediaPreviewWidth,
  key: string,
): Promise<GeneratedPreview> {
  const original = await storage.getObject(asset.storageKey, asset.mimeType);
  if (!original) return null;
  const source = await streamToBuffer(original.stream);

  let preview: Buffer;
  try {
    preview = await renderMediaPreview(source, width);
  } catch (error) {
    // Неразбираемый исходник — отдаём его как есть: превью необязательно.
    logError("media.preview.render_failed", {
      assetId: asset.id,
      width,
      error: error instanceof Error ? error.message : String(error),
    });
    return { bytes: source, contentType: asset.mimeType };
  }

  try {
    await storage.putObject({ key, bytes: new Uint8Array(preview), contentType: MEDIA_PREVIEW_CONTENT_TYPE });
    await dropPreviewIfAssetGone(storage, asset.id, key);
  } catch (error) {
    // Не сохранили — не беда: ответ уже собран, следующий запрос попробует снова.
    logError("media.preview.store_failed", {
      assetId: asset.id,
      width,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { bytes: preview, contentType: MEDIA_PREVIEW_CONTENT_TYPE };
}

/**
 * Превью актива нужной ширины: готовый вариант из хранилища, иначе — собрать,
 * сохранить и отдать. `null` — в хранилище нет самого оригинала (вызывающий
 * обрабатывает это так же, как при отдаче оригинала: 404 + BROKEN).
 *
 * Доступ здесь НЕ проверяется — это делает роут той же веткой, что и для
 * оригинала; функция вызывается только после неё.
 */
export async function readMediaPreview(
  asset: PreviewSourceAsset,
  width: MediaPreviewWidth,
): Promise<MediaBody | null> {
  const storage = getStorageProvider();
  const key = mediaPreviewStorageKey(asset.storageKey, width);

  const stored = await storage.getObject(key, MEDIA_PREVIEW_CONTENT_TYPE);
  if (stored) {
    return {
      body: Readable.toWeb(stored.stream) as ReadableStream,
      sizeBytes: stored.sizeBytes,
      contentType: MEDIA_PREVIEW_CONTENT_TYPE,
    };
  }

  let pending = inflightPreviews.get(key);
  if (!pending) {
    pending = generatePreview(storage, asset, width, key).finally(() => {
      inflightPreviews.delete(key);
    });
    inflightPreviews.set(key, pending);
  }
  const generated = await pending;
  return generated ? bufferBody(generated.bytes, generated.contentType) : null;
}

/**
 * Удаляет все варианты актива. Отсутствующий ключ — успех (контракт
 * `deleteObject`), поэтому набор удаляется целиком, без учёта созданных.
 * Бросает, если хоть один ключ не удалился: purge обязан видеть провал
 * (недоудалённая производная ПДн), `deleteAssetById` его логирует.
 */
export async function deleteMediaPreviews(storage: StorageProvider, storageKey: string): Promise<void> {
  const results = await Promise.allSettled(
    mediaPreviewStorageKeys(storageKey).map((key) => storage.deleteObject(key)),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}
