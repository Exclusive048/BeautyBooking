import "server-only";

import type { MediaKind } from "@prisma/client";

import type { CropArea } from "@/lib/media/crop-geometry";
import { cropMaxSideForKind, renderCroppedImage } from "@/lib/media/crop-render";
import type { MediaPreviewWidth } from "@/lib/media/preview-variants";
import { withMediaRenderSlot } from "@/lib/media/render-limit";
import { getStorageProvider } from "@/lib/media/storage";

/**
 * MEDIA-RENDER-DEDUP (2026-10-30) — вырез `GET /api/media/file/{id}/crop/{v}`:
 * один рендер на одинаковые одновременные запросы и общий предел sharp.
 *
 * После PORTFOLIO-CROP-01 вырезом показывается каждая обрезанная работа в
 * ленте, историях, каталоге и кабинетах, а не только аватары. Каждый промах
 * HTTP-кэша — чтение исходника из хранилища целиком и sharp (metadata →
 * extract → resize → webp). Плитку, которую одновременно запросили N
 * клиентов (холодная лента после деплоя: кэш `next/image` живёт в ФС
 * контейнера), раньше резали N раз (A-05, E-02).
 *
 * ## Дедупликация
 *
 * По образцу `inflightPreviews` (`preview-variants.ts`): ключ — актив, версия
 * области и ширина. Версия — `cropVersionToken` той же области, что режется:
 * роут сверяет её с БД до вызова (устаревшая уводит редиректом), поэтому один
 * ключ — одна область. Map держит только идущие рендеры: результат после
 * завершения не хранится, это не кэш.
 *
 * ## Сохранённого варианта нет — намеренно
 *
 * Вырез не пишется в хранилище, в отличие от превью `?w=`. Ключ варианта
 * обязан нести версию области, и при каждой смене области прежний вариант
 * осиротел бы: старую версию из текущих координат не вывести, удаление
 * превью его не найдёт, а для аватара это производная ПДн, пережившая
 * оригинал. Сначала — удаление вариантов прежней версии в писателе области и
 * по префиксу в удаляющих путях (`MEDIA-CROP-VARIANT-STORE` в BACKLOG).
 */

type CropSourceAsset = { id: string; storageKey: string; mimeType: string; kind: MediaKind };

const inflightCrops = new Map<string, Promise<Buffer | null>>();

export function cropRenderKey(assetId: string, version: string, width: MediaPreviewWidth | null): string {
  return `${assetId}:${version}:${width ?? "full"}`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function renderCrop(
  asset: CropSourceAsset,
  area: CropArea,
  width: MediaPreviewWidth | null,
): Promise<Buffer | null> {
  // Исходник читается до слота: ожидание хранилища — сетевой ввод-вывод, слот
  // на это время простаивал бы.
  const file = await getStorageProvider().getObject(asset.storageKey, asset.mimeType);
  if (!file) return null;
  const source = await streamToBuffer(file.stream);
  return withMediaRenderSlot(() =>
    renderCroppedImage(source, area, cropMaxSideForKind(asset.kind), width ?? undefined),
  );
}

/**
 * Вырез сохранённой области нужной ширины (`null` — полный вырез). `null` в
 * ответе — в хранилище нет исходника (роут отвечает 404). Ошибка рендера или
 * хранилища достаётся всем, кто ждал этот ключ, и ключ освобождается: следующий
 * запрос попробует заново.
 *
 * Доступ здесь НЕ проверяется — роут зовёт функцию после своей ветки доступа.
 */
export function readCroppedMedia(
  asset: CropSourceAsset,
  area: CropArea,
  version: string,
  width: MediaPreviewWidth | null,
): Promise<Buffer | null> {
  const key = cropRenderKey(asset.id, version, width);
  let pending = inflightCrops.get(key);
  if (!pending) {
    pending = renderCrop(asset, area, width).finally(() => {
      inflightCrops.delete(key);
    });
    inflightCrops.set(key, pending);
  }
  return pending;
}
