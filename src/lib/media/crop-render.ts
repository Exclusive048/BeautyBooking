import sharp from "sharp";
import type { CropArea } from "@/lib/media/crop-geometry";

/**
 * CROP-PUBLIC-01 — сохранённая область обрезки, вырезанная из исходника.
 *
 * Область хранится долями (`MediaAsset.cropX/…`), поэтому пиксели считаются
 * здесь от фактических размеров файла, с клампом: округление не имеет права
 * вывести прямоугольник за край (sharp бросает на `extract` за границей).
 *
 * Потолок стороны — для аватаров: их показывают не крупнее ~200 CSS px, то
 * есть 600 px на экране 3×; отдавать полноразмерный вырез незачем.
 */
export const AVATAR_CROP_MAX_SIDE_PX = 640;

export type CropPixels = { left: number; top: number; width: number; height: number };

export function cropAreaToPixels(area: CropArea, imageWidth: number, imageHeight: number): CropPixels {
  const left = Math.min(Math.max(0, Math.round(area.x * imageWidth)), imageWidth - 1);
  const top = Math.min(Math.max(0, Math.round(area.y * imageHeight)), imageHeight - 1);
  const width = Math.max(1, Math.min(Math.round(area.width * imageWidth), imageWidth - left));
  const height = Math.max(1, Math.min(Math.round(area.height * imageHeight), imageHeight - top));
  return { left, top, width, height };
}

export async function renderCroppedImage(
  source: Buffer,
  area: CropArea,
  maxSidePx: number = AVATAR_CROP_MAX_SIDE_PX,
): Promise<Buffer> {
  const image = sharp(source);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("image has no dimensions");
  }
  return image
    .extract(cropAreaToPixels(area, meta.width, meta.height))
    .resize({ width: maxSidePx, height: maxSidePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}
