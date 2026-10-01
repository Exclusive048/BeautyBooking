import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import { readValidatedImageUpload } from "@/lib/media/validate-image-upload";
import {
  MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
  MEDIA_MAX_IMAGE_SIDE_PX,
  capLongestSide,
} from "@/lib/media/image-resize";

/**
 * PERF-07 — перекодирование на аплоаде было, `.resize()` не было ни в одном из
 * пяти путей загрузки: в хранилище ложился оригинал вплоть до 10 МБ. Портфолио
 * от этого страдало на сервере (оптимизатор `next/image` тянул оригинал из S3
 * на каждый промах своего кэша), вложения чата — в браузере (там обычный
 * `<img>`, оригинал едет в бокс высотой 200 px).
 *
 * Проверяется не «вызвали resize», а свойство результата: длинная сторона
 * ограничена, короткая пропорциональна, мелкая картинка НЕ растянута.
 */

async function image(width: number, height: number): Promise<File> {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });
}

async function sizeOf(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const meta = await sharp(Buffer.from(bytes)).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

describe("PERF-07 · загруженное изображение ограничено сверху по разрешению", () => {
  it("альбомный кадр крупнее порога ужимается по длинной стороне", async () => {
    const result = await readValidatedImageUpload(await image(4000, 3000), {
      quality: 90,
      maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
    });

    expect(await sizeOf(result.bytes)).toEqual({ width: 1600, height: 1200 });
  });

  it("портретный кадр ограничивается по ВЫСОТЕ — порог на длинную сторону, не на ширину", async () => {
    const result = await readValidatedImageUpload(await image(3000, 4000), {
      quality: 90,
      maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
    });

    expect(await sizeOf(result.bytes)).toEqual({ width: 1200, height: 1600 });
  });

  it("кадр меньше порога не растягивается", async () => {
    const result = await readValidatedImageUpload(await image(800, 600), {
      quality: 90,
      maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
    });

    expect(await sizeOf(result.bytes)).toEqual({ width: 800, height: 600 });
  });

  it("ресайз ощутимо уменьшает вес хранимого файла", async () => {
    const source = await image(4000, 3000);
    const capped = await readValidatedImageUpload(source, {
      quality: 90,
      maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
    });
    const uncapped = await sharp(Buffer.from(await source.arrayBuffer()))
      .jpeg({ quality: 90 })
      .toBuffer();

    expect(capped.sizeBytes).toBeLessThan(uncapped.length);
  });

  it("порог портфолио (webp-ветка, как в /api/media) ограничивает 6000-пиксельный кадр", async () => {
    const png = await sharp({
      create: { width: 6000, height: 4000, channels: 3, background: { r: 10, g: 200, b: 90 } },
    })
      .png()
      .toBuffer();

    const out = await capLongestSide(sharp(png), MEDIA_MAX_IMAGE_SIDE_PX)
      .webp({ quality: 95 })
      .toBuffer();
    const meta = await sharp(out).metadata();

    expect({ width: meta.width, height: meta.height }).toEqual({ width: 2560, height: 1707 });
    expect(meta.format).toBe("webp");
  });

  it("порог портфолио покрывает самую широкую поверхность показа (768 CSS px × 3 DPR)", () => {
    expect(MEDIA_MAX_IMAGE_SIDE_PX).toBeGreaterThanOrEqual(768 * 3);
    expect(MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX).toBeLessThan(MEDIA_MAX_IMAGE_SIDE_PX);
  });

  /**
   * MEDIA-EXIF-ORIENTATION. Снимок с телефона несёт `Orientation: 6` (кадр
   * лежит на боку, тег велит повернуть на 90°). sharp при переупаковке тег
   * снимает и без `.rotate()` пиксели не трогает — файл хранился «на боку».
   * Проверяется свойство результата: пиксели повёрнуты (ширина и высота
   * поменялись местами), тега ориентации больше нет, и порог длинной стороны
   * применён ПОСЛЕ поворота.
   *
   * @probe убран `.rotate()` из `capLongestSide` → `{ width: 400, height: 200 }`
   * вместо ожидаемых `{ width: 200, height: 400 }` — тест красный.
   */
  it("EXIF-ориентация применяется к пикселям до ресайза, тег обнуляется", async () => {
    const sideways = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);

    const out = await capLongestSide(sharp(sideways), 300).jpeg().toBuffer();
    const meta = await sharp(out).metadata();

    expect({ width: meta.width, height: meta.height }).toEqual({ width: 150, height: 300 });
    expect(meta.orientation).toBeUndefined();
  });

  it("capLongestSide не увеличивает изображение (withoutEnlargement)", async () => {
    const small = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const out = await capLongestSide(sharp(small), 2000).jpeg().toBuffer();
    const meta = await sharp(out).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 40, height: 20 });
  });
});

/**
 * MEDIA-UPLOAD-DEDUP (2026-10-01): все роуты, сохраняющие загруженное фото,
 * идут через `readValidatedImageUpload`, у которого `maxSidePx` обязателен
 * типом. Собственный пайплайн (`sharp` / `file-type`) в роуте — снова копия
 * без этой гарантии. Исключения — посайтово, с причиной.
 *
 * @probe 2026-10-01 — вернуть в `api/media/route.ts` импорт `sharp` → красный
 *        «ни один роут не держит свой пайплайн загрузки».
 */
describe("PERF-07 · guard — роуты не держат собственный пайплайн загрузки", () => {
  const API_ROOT = resolve(__dirname, "..", "..", "app", "api");
  const ALLOWED: Record<string, string> = {
    // Фото запроса визуального поиска не сохраняется — его уменьшают в памяти
    // перед отправкой модели; лимиты хранилища к нему не относятся.
    "search/by-photo/route.ts": "фото запроса не сохраняется",
  };

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walk(full));
        continue;
      }
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  const pipelines = walk(API_ROOT)
    .filter((file) => /from "sharp"|from "file-type"/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(API_ROOT.length + 1).split("\\").join("/"));

  it("ни один роут не держит свой пайплайн загрузки", () => {
    expect(pipelines.filter((rel) => !(rel in ALLOWED))).toEqual([]);
  });

  it("исключения не протухли", () => {
    for (const rel of Object.keys(ALLOWED)) expect(pipelines).toContain(rel);
  });
});
