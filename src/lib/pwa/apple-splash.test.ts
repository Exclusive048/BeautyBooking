import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPLE_SPLASH_DEVICES, APPLE_STARTUP_IMAGES, appleSplashPixelSize, appleSplashUrl } from "@/lib/pwa/apple-splash";

/**
 * PWA-SPLASH-01 — за каждой заставкой iOS из `<head>` лежит файл ровно того
 * размера, что обещает `media`.
 *
 * До правки `layout.tsx` перечислял четыре `/splash/*.png`, которых не было в
 * `public/`: на проде все четыре отдавали 404, и iOS показывал белый экран.
 *
 * @probe 2026-10-03 — удалить `public/splash/apple-splash-750-1334.png` →
 *        красный «нет файла»; вернуть в `layout.tsx` литерал `/splash/…` →
 *        красный «список заставок только из apple-splash.ts».
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SPLASH_DIR = path.join(PUBLIC_DIR, "splash");

function pngSize(file: string): string {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("заставки iOS", () => {
  it.each(APPLE_SPLASH_DEVICES.map((device) => ({ device, url: appleSplashUrl(device) })))(
    "$url существует и совпадает по размеру",
    ({ device, url }) => {
      const { width, height } = appleSplashPixelSize(device);
      const file = path.join(PUBLIC_DIR, url);
      expect(() => readFileSync(file), "нет файла").not.toThrow();
      expect(pngSize(file)).toBe(`${width}x${height}`);
    },
  );

  it("media описывает тот же экран, что имя файла", () => {
    for (const image of APPLE_STARTUP_IMAGES) {
      const [, width, height, ratio] = image.media.match(
        /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/,
      )!;
      expect(image.url.split("?")[0]).toBe(
        `/splash/apple-splash-${Number(width) * Number(ratio)}-${Number(height) * Number(ratio)}.png`,
      );
    }
  });

  it("каждому экрану — одна заставка, и лишних файлов нет", () => {
    const urls = APPLE_STARTUP_IMAGES.map((image) => image.url.split("?")[0]!);
    expect(new Set(urls).size).toBe(urls.length);
    const files = readdirSync(SPLASH_DIR).map((name) => `/splash/${name}`);
    expect(files.sort()).toEqual([...urls].sort());
  });

  it("список заставок только из apple-splash.ts", () => {
    const layout = readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/["'`]\/splash\//);
    expect(layout).toMatch(/startupImage:\s*\[\.\.\.APPLE_STARTUP_IMAGES\]/);
  });
});
