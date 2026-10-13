import { MediaKind } from "@prisma/client";
import sharp from "sharp";
import type { CropArea } from "@/lib/media/crop-geometry";
import { MEDIA_MAX_IMAGE_SIDE_PX } from "@/lib/media/image-resize";

/**
 * CROP-PUBLIC-01 — сохранённая область обрезки, вырезанная из исходника.
 *
 * Область хранится долями (`MediaAsset.cropX/…`), поэтому пиксели считаются
 * здесь от фактических размеров файла, с клампом: округление не имеет права
 * вывести прямоугольник за край (sharp бросает на `extract` за границей).
 *
 * Потолок стороны аватара: их показывают не крупнее ~200 CSS px, то есть
 * 600 px на экране 3×; отдавать полноразмерный вырез незачем.
 */
export const AVATAR_CROP_MAX_SIDE_PX = 640;

/**
 * PORTFOLIO-CROP-01 — потолок стороны выреза по виду фото. Работу портфолио
 * показывают крупно (лента, просмотр во весь экран), поэтому её вырез не
 * уменьшается: он и так не больше исходника, а исходник ограничен при загрузке
 * тем же `MEDIA_MAX_IMAGE_SIDE_PX`. Нужный экрану размер делает оптимизатор
 * картинок, приложению — `?w=`.
 */
export function cropMaxSideForKind(kind: MediaKind): number {
  return kind === MediaKind.AVATAR ? AVATAR_CROP_MAX_SIDE_PX : MEDIA_MAX_IMAGE_SIDE_PX;
}

export type CropPixels = { left: number; top: number; width: number; height: number };

export function cropAreaToPixels(area: CropArea, imageWidth: number, imageHeight: number): CropPixels {
  const left = Math.min(Math.max(0, Math.round(area.x * imageWidth)), imageWidth - 1);
  const top = Math.min(Math.max(0, Math.round(area.y * imageHeight)), imageHeight - 1);
  const width = Math.max(1, Math.min(Math.round(area.width * imageWidth), imageWidth - left));
  const height = Math.max(1, Math.min(Math.round(area.height * imageHeight), imageHeight - top));
  return { left, top, width, height };
}

/**
 * `width` — ширина превью (`?w=`, MOBILE-B1): вырез уменьшается до неё, не
 * увеличиваясь и не выходя за `maxSidePx`.
 */
export async function renderCroppedImage(
  source: Buffer,
  area: CropArea,
  maxSidePx: number = AVATAR_CROP_MAX_SIDE_PX,
  width?: number,
): Promise<Buffer> {
  const image = sharp(source);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("image has no dimensions");
  }
  const extracted = image.extract(cropAreaToPixels(area, meta.width, meta.height));
  const resized = width
    ? extracted.resize({ width: Math.min(width, maxSidePx), withoutEnlargement: true })
    : extracted.resize({ width: maxSidePx, height: maxSidePx, fit: "inside", withoutEnlargement: true });
  return resized.webp({ quality: 90 }).toBuffer();
}
