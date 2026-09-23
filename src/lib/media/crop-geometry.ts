import type { CSSProperties } from "react";

/**
 * CROP-PREVIEW-01 — как показать сохранённую область обрезки ТОЧНО.
 *
 * Область хранится долями исходника (`MediaAsset.cropX/cropY/cropWidth/
 * cropHeight`, 0…1): `x`/`width` — от ширины, `y`/`height` — от высоты. Так её
 * отдаёт `react-easy-crop` (в процентах) и так её пишет `PATCH /api/media/[id]/crop`.
 *
 * Показ: `<img>` абсолютно внутри бокса `overflow: hidden`, растянутый так,
 * чтобы область заняла бокс целиком. Ширина картинки = бокс / `width`, левый
 * край сдвинут на `x / width` ширин бокса (проценты `left`/`width` у
 * абсолютного элемента считаются от бокса). Пропорции картинки при этом
 * сохраняются ровно тогда, когда у бокса то же соотношение сторон, что у
 * области в ПИКСЕЛЯХ, — у аватара это квадрат в квадрате, у 16:9 — 16:9 в 16:9.
 *
 * Прежние два способа врали по-разному. Превью кроппера растягивало картинку
 * по ширинному масштабу в ОБЕ стороны и двигало `transform: translate(%)`,
 * а проценты `translate` считаются от самого элемента, не от бокса, — на
 * неквадратном фото или с увеличением миниатюра показывала другое место, чем
 * кружок. Показ аватара ставил `object-position` в центр области: это
 * игнорирует увеличение целиком и смещает кадр к краю, потому что проценты
 * `object-position` выравнивают точку картинки с ТАКОЙ ЖЕ точкой бокса, а не
 * с его центром.
 */
export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function cropAreaImageStyle(area: CropArea): CSSProperties {
  return {
    position: "absolute",
    width: `${100 / area.width}%`,
    height: `${100 / area.height}%`,
    left: `${(-area.x / area.width) * 100}%`,
    top: `${(-area.y / area.height) * 100}%`,
    right: "auto",
    bottom: "auto",
    maxWidth: "none",
    maxHeight: "none",
  };
}

/** Полная область из четырёх nullable-колонок `MediaAsset`, либо `null`. */
export function toCropArea(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): CropArea | null {
  if (x == null || y == null || width == null || height == null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}
