import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPLE_STARTUP_IMAGES } from "@/lib/pwa/apple-splash";
import { computeBrandAssetFingerprint } from "@/lib/pwa/brand-asset-fingerprint";
import { BRAND_ASSET_VERSION } from "@/lib/pwa/brand-asset-version";
import { SITE_ICONS } from "@/lib/seo/site-icons";
import { listSourceFiles } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * BRAND-ICONS-CACHE-01 — новый знак доезжает до вкладки браузера и до
 * приложения на рабочем столе.
 *
 * Набор «Наложение» (BRAND-ICONS-03) заменил файлы по тем же адресам: на проде
 * лежали новые, а фавиконка и иконка установленного приложения оставались
 * прежней «M» — их отдавали кэш сервис-воркера (`images-cache`,
 * StaleWhileRevalidate), кэш фавиконок Chrome и iOS. Новый адрес — единственное,
 * что эти кэши обходит, поэтому каждый адрес иконки несёт `?v=` версии набора,
 * а версия — отпечаток самих файлов.
 *
 * @probe 2026-10-06 — дописать пробел в конец `public/brand/favicon.svg` →
 *        красный «набор иконок изменился, а версия в адресах нет»; CRLF вместо
 *        LF в том же файле — зелёный (отпечаток считается по тексту без `\r`,
 *        сверено с выгрузкой `git archive`).
 * @probe 2026-10-06 — снять `versionedBrandUrl` с `/brand/apple-touch-icon.png`
 *        в `site-icons.ts` → красный «адрес без текущей ?v=»; вернуть в
 *        `layout.tsx` литерал `url: "/brand/og-mark.png"` → красный
 *        «литерал без versionedBrandUrl».
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");
const VERSION_SUFFIX = `?v=${BRAND_ASSET_VERSION}`;
const BRAND_IMAGE_LITERAL = /\/(?:brand|splash)\/[\w.-]+\.(?:png|svg|ico|jpe?g|webp)/g;
const WRAPPED = /versionedBrandUrl\(\s*["'`]$/;

type ManifestIcon = { src: string };

describe("версия набора иконок", () => {
  it("совпадает с отпечатком public/brand + public/splash", () => {
    expect(
      BRAND_ASSET_VERSION,
      "набор иконок изменился, а версия в адресах нет — запустите npm run generate:icons",
    ).toBe(computeBrandAssetFingerprint(PUBLIC_DIR));
  });

  it("каждый адрес <head> и манифеста несёт текущую версию", () => {
    const manifest = JSON.parse(readFileSync(path.join(PUBLIC_DIR, "brand", "manifest.webmanifest"), "utf8")) as {
      icons: ManifestIcon[];
      shortcuts?: { icons?: ManifestIcon[] }[];
    };
    const urls = [
      ...[...SITE_ICONS.icon, ...SITE_ICONS.apple, ...SITE_ICONS.other].map((link) => link.url),
      ...APPLE_STARTUP_IMAGES.map((image) => image.url),
      ...manifest.icons.map((icon) => icon.src),
      ...(manifest.shortcuts ?? []).flatMap((shortcut) => (shortcut.icons ?? []).map((icon) => icon.src)),
    ];
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.filter((url) => !url.endsWith(VERSION_SUFFIX)), "адрес без текущей ?v=").toEqual([]);
  });

  it("литерал адреса картинки бренда в src/ — только аргументом versionedBrandUrl", () => {
    const bare: string[] = [];
    for (const file of listSourceFiles()) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const match of code.matchAll(BRAND_IMAGE_LITERAL)) {
        const before = code.slice(Math.max(0, match.index - 40), match.index);
        if (!WRAPPED.test(before)) bare.push(`${path.relative(process.cwd(), file)}: ${match[0]}`);
      }
    }
    expect(bare, "литерал без versionedBrandUrl").toEqual([]);
  });
});
