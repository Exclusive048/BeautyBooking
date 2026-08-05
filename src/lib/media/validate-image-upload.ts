import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { AppError } from "@/lib/api/errors";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  type AllowedMediaMimeType,
} from "@/lib/media/types";

/**
 * SEC-06 — единственная точка, где загруженный файл превращается в байты,
 * которым можно доверять.
 *
 * Два роута фото клиентской карточки (`master/clients/[clientKey]/card/photos`
 * и его студийный близнец) отдавали в хранилище СЫРЫЕ байты с `mimeType:
 * fileValue.type` — строкой, присланной клиентом. Ниже по стеку
 * `validateUploadBasics` сверяет только эту строку с allowlist'ом, то есть
 * мастер/студия могли положить произвольный файл (HTML, SVG, ZIP) под
 * заявленным `image/png`. От «загруженный HTML исполняется в origin» защищал
 * ровно один заголовок — `X-Content-Type-Options: nosniff`.
 *
 * Правильный путь уже существовал в трёх других роутах, но тремя копиями. Здесь
 * он один:
 *   1. размер до чтения буфера;
 *   2. `fileTypeFromBuffer` — тип по МАГИЧЕСКИМ БАЙТАМ, не по заявлению;
 *   3. allowlist по определённому типу;
 *   4. `sharp` re-encode — переупаковка убивает всё, что не является
 *      картинкой (полезная нагрузка в метаданных, полиглоты);
 *   5. размер после переупаковки.
 *
 * `quality` — параметр, а не константа, потому что call-site'ы намеренно
 * разные: мастерские поверхности (`/api/media`) держат 95 (на q90 были видны
 * артефакты на макро-снимках ногтей и макияжа), вложения чата и референсы
 * брони — 90. Ужать их в одно число значило бы поменять то, что видит
 * пользователь.
 */

/**
 * `fileTypeFromBuffer` на коротком/обрезанном входе НЕ возвращает undefined, а
 * бросает `EndOfStreamError` (например, на 10 байтах ZIP-заголовка). В трёх
 * скопированных инлайн-версиях это уходило в общий catch роута и становилось
 * 500 вместо чистого 415. Здесь любой сбой распознавания — это просто «не
 * распознали как картинку».
 */
async function sniffMime(buffer: Buffer): Promise<string | null> {
  try {
    const detected = await fileTypeFromBuffer(buffer);
    return detected?.mime ?? null;
  } catch {
    return null;
  }
}

/** PNG и всё нестандартное уходит в webp; jpeg остаётся jpeg. */
function encodeTo(mime: string, buffer: Buffer, quality: number) {
  if (mime === "image/jpeg") {
    return { mime: "image/jpeg" as AllowedMediaMimeType, output: sharp(buffer).jpeg({ quality }) };
  }
  return { mime: "image/webp" as AllowedMediaMimeType, output: sharp(buffer).webp({ quality }) };
}

export type ValidatedImageUpload = {
  bytes: Uint8Array;
  mimeType: AllowedMediaMimeType;
  sizeBytes: number;
};

export async function readValidatedImageUpload(
  file: File,
  options: { quality: number },
): Promise<ValidatedImageUpload> {
  if (file.size <= 0 || file.size > MEDIA_MAX_FILE_SIZE_BYTES) {
    throw new AppError("Файл слишком большой.", 413, "MEDIA_FILE_TOO_LARGE");
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const detectedMime = await sniffMime(rawBuffer);
  if (!detectedMime || !MEDIA_ALLOWED_MIME_TYPES.includes(detectedMime as AllowedMediaMimeType)) {
    throw new AppError("Неподдерживаемый формат изображения.", 415, "MEDIA_INVALID_MIME");
  }

  const { mime, output } = encodeTo(detectedMime, rawBuffer, options.quality);
  // Битая картинка проходит sniff по заголовку, но не декодируется. Это тоже
  // «неподдерживаемый формат», а не 500.
  let outputBuffer: Buffer;
  try {
    outputBuffer = await output.toBuffer();
  } catch {
    throw new AppError("Неподдерживаемый формат изображения.", 415, "MEDIA_INVALID_MIME");
  }
  if (outputBuffer.length <= 0 || outputBuffer.length > MEDIA_MAX_FILE_SIZE_BYTES) {
    throw new AppError("Файл слишком большой.", 413, "MEDIA_FILE_TOO_LARGE");
  }

  return {
    bytes: new Uint8Array(outputBuffer),
    mimeType: mime,
    sizeBytes: outputBuffer.length,
  };
}
