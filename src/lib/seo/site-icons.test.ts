import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SITE_ICONS } from "@/lib/seo/site-icons";

/**
 * SEO-FAVICON-01 — фавиконка, которую Яндекс может загрузить, и набор иконок
 * BRAND-ICONS-02, на который ссылаются `<head>` и манифест.
 *
 * Вебмастер сообщал «робот не смог загрузить фавиконку». Яндекс берёт ЛЮБУЮ из
 * ссылок `<link rel="icon">` (и `apple-touch-icon`) и принимает SVG либо
 * 120×120 / 32×32 / 16×16; ссылка, чей `type`/размер расходится с файлом, —
 * ошибка загрузки. Тест читает сами файлы, а не список.
 *
 * @probe 2026-10-03 — вернуть в `SITE_ICONS.icon` `/brand/icon-512.png` с
 *        `sizes: "512x512"` → красный «размер вне набора Яндекса»; объявить у
 *        `/brand/icon-120.png` `sizes: "128x128"` → красный «128x128 vs 120x120».
 * @probe 2026-10-03 — вернуть `src/app/favicon.ico` из `git show HEAD~:` →
 *        красный «иконка шаблона Next».
 * @probe 2026-10-03 — манифест из набора дизайнера как есть (`"src":
 *        "brand/icon-48.png"`, относительно `/brand/manifest.webmanifest` это
 *        `/brand/brand/…`) → красный «адрес не от корня»; вернуть ярлык
 *        `/?action=bookings` → красный «ярлык ведёт на несуществующую страницу».
 */

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const YANDEX_ICON_SIZES = new Set(["16x16", "32x32", "120x120", "any"]);
// md5 `favicon.ico` из create-next-app — треугольник Vercel, жил на проде до SEO-FAVICON-01.
const NEXT_TEMPLATE_FAVICON_MD5 = "c30c7d42707a47a3f4591831641e50dc";

type IconLink = { url: string; sizes: string; type: string };

// Адреса несут `?v=` версии набора (BRAND-ICONS-CACHE-01) — файл по пути без него.
function publicPath(url: string): string {
  return path.join(PUBLIC_DIR, url.split("?")[0]!);
}

function readPublic(url: string): Buffer {
  return readFileSync(publicPath(url));
}

function describeFile(bytes: Buffer): { type: string; sizes: string } {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: "image/png", sizes: `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` };
  }
  if (bytes.subarray(0, 512).toString("utf8").includes("<svg")) {
    return { type: "image/svg+xml", sizes: "any" };
  }
  return { type: "unknown", sizes: "unknown" };
}

function icoSizes(bytes: Buffer): string[] {
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const width = bytes[6 + 16 * i] || 256;
    const height = bytes[7 + 16 * i] || 256;
    return `${width}x${height}`;
  });
}

const allLinks: IconLink[] = [...SITE_ICONS.icon, ...SITE_ICONS.apple];

describe("SITE_ICONS", () => {
  it.each(allLinks)("$url: тип и размер в ссылке совпадают с файлом", (link) => {
    expect(describeFile(readPublic(link.url))).toEqual({ type: link.type, sizes: link.sizes });
  });

  it("rel=icon — только размеры, которые принимает Яндекс, и есть SVG и 120×120", () => {
    const outside = SITE_ICONS.icon.filter((link) => !YANDEX_ICON_SIZES.has(link.sizes));
    expect(outside, "размер вне набора Яндекса").toEqual([]);
    expect(SITE_ICONS.icon.map((link) => link.type)).toContain("image/svg+xml");
    expect(SITE_ICONS.icon.map((link) => link.sizes)).toContain("120x120");
  });

  it("apple-touch-icon без прозрачных углов (иначе iOS дорисует чёрные)", async () => {
    const file = publicPath(SITE_ICONS.apple[0].url);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const last = info.width - 1;
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect([alphaAt(0, 0), alphaAt(last, 0), alphaAt(0, last), alphaAt(last, last)]).toEqual([255, 255, 255, 255]);
  });

  it("mask-icon — одноцветный SVG", () => {
    const [mask] = SITE_ICONS.other;
    const svg = readPublic(mask.url).toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg, "в силуэте нет градиентов — Safari красит его сам").not.toMatch(/Gradient/);
  });

  it("в SVG набора нет служебных метаданных (C2PA)", () => {
    const svgs = readdirSync(path.join(PUBLIC_DIR, "brand")).filter((name) => name.endsWith(".svg"));
    for (const name of svgs) {
      expect(readFileSync(path.join(PUBLIC_DIR, "brand", name), "utf8"), name).not.toMatch(/c2pa|<metadata/i);
    }
  });
});

describe("src/app/favicon.ico", () => {
  const bytes = readFileSync(path.join(ROOT, "src", "app", "favicon.ico"));

  it("не иконка шаблона Next", () => {
    expect(createHash("md5").update(bytes).digest("hex"), "иконка шаблона Next").not.toBe(
      NEXT_TEMPLATE_FAVICON_MD5,
    );
  });

  it("валидный ICO с 16×16, 32×32 и 48×48 — тот же файл, что в наборе", () => {
    expect(icoSizes(bytes)).toEqual(expect.arrayContaining(["16x16", "32x32", "48x48"]));
    expect(bytes.equals(readPublic("/brand/favicon.ico")), "расходится с /brand/favicon.ico").toBe(true);
  });
});

describe("/brand/manifest.webmanifest", () => {
  type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };
  const manifest = JSON.parse(readPublic("/brand/manifest.webmanifest").toString("utf8")) as {
    icons: ManifestIcon[];
    shortcuts: { url: string; icons: ManifestIcon[] }[];
    display_override?: string[];
  };
  const icons = [...manifest.icons, ...manifest.shortcuts.flatMap((shortcut) => shortcut.icons)];

  it.each(icons)("$src ($purpose): адрес от корня, тип и размер совпадают с файлом", (icon) => {
    expect(icon.src, "адрес не от корня").toMatch(/^\/brand\//);
    expect(describeFile(readPublic(icon.src))).toEqual({ type: icon.type, sizes: icon.sizes });
  });

  it("any, maskable и monochrome — отдельными записями", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose ?? "any");
    expect(purposes.every((purpose) => !purpose.includes(" ")), "purpose с пробелом — одна запись на два назначения").toBe(true);
    expect(new Set(purposes)).toEqual(new Set(["any", "maskable", "monochrome"]));
    const anyPng = manifest.icons.filter((icon) => (icon.purpose ?? "any") === "any").map((icon) => icon.sizes);
    expect(anyPng).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("ярлыки ведут на существующие страницы", () => {
    const pageByUrl: Record<string, string> = {
      "/cabinet/master": "src/app/(cabinet)/cabinet/master/page.tsx",
      "/cabinet/studio": "src/app/(cabinet)/cabinet/studio/page.tsx",
      "/cabinet/bookings": "src/app/(cabinet)/cabinet/(user)/bookings/page.tsx",
      "/catalog": "src/app/catalog/page.tsx",
    };
    for (const { url } of manifest.shortcuts) {
      const page = pageByUrl[url];
      expect(page, `ярлык ведёт на несуществующую страницу: ${url}`).toBeDefined();
      expect(existsSync(path.join(ROOT, page!)), page).toBe(true);
    }
  });

  it("без window-controls-overlay: шапка приложения под него не размечена", () => {
    expect(manifest.display_override ?? []).not.toContain("window-controls-overlay");
  });
});
