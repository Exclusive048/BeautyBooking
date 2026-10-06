/**
 * Производные иконки из набора `public/brand/` (BRAND-ICONS-02, PWA-SPLASH-01,
 * набор «Наложение» BRAND-ICONS-03).
 *
 * Сам набор (`favicon.*`, `icon-*.png`, `og-mark.png`, манифест) приходит от
 * дизайнера готовым, и его файлы этим скриптом не трогаются — кроме адресов в
 * манифесте (последний пункт). Здесь — только то, чего в наборе нет:
 *  - `public/brand/icon-120.png` — размер, который Яндекс принимает как
 *    фавиконку (`lib/seo/site-icons.ts`);
 *  - `public/splash/*.png` — заставки iOS для приложения на экране «Домой»
 *    по списку `lib/pwa/apple-splash.ts`;
 *  - `public/brand/email-avatar-512.png` — аватар отправителя почты (Mail.ru
 *    Постмастер, `DEPLOY-BACKLOG.md`): непрозрачный квадрат из
 *    `email-avatar.svg`;
 *  - версия набора `BRAND_ASSET_VERSION` (`lib/pwa/brand-asset-version.ts`) —
 *    отпечаток `public/brand/` + `public/splash/` после шагов выше — и `?v=`
 *    у каждой иконки в `manifest.webmanifest` (BRAND-ICONS-CACHE-01: без
 *    нового адреса кэши браузера и сервис-воркера отдают прежний знак).
 *
 * Источник иконки и заставок — `icon-1024.png` набора, а не SVG: у PNG-ряда
 * дизайнера свой масштаб знака и блик, которых в `favicon.svg` (знак крупнее —
 * для 16–32 px) нет. Уменьшение с 1024 даёт тот же рисунок, что `icon-128.png`.
 *
 * Запуск после замены набора: `npm run generate:icons`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { APPLE_SPLASH_DEVICES, appleSplashPixelSize, appleSplashUrl } from "../src/lib/pwa/apple-splash";
import { computeBrandAssetFingerprint } from "../src/lib/pwa/brand-asset-fingerprint";
import { BRAND_COLORS } from "../src/lib/ui/brand-colors";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const ICON_PNG = path.join(PUBLIC_DIR, "brand", "icon-1024.png");
const MANIFEST = path.join(PUBLIC_DIR, "brand", "manifest.webmanifest");
const VERSION_MODULE = path.join(process.cwd(), "src", "lib", "pwa", "brand-asset-version.ts");
const VERSION_LINE = /export const BRAND_ASSET_VERSION = "[^"]*";/;
const EMAIL_AVATAR_SVG = path.join(PUBLIC_DIR, "brand", "email-avatar.svg");
const EMAIL_AVATAR_PX = 512;
// Знак на заставке — в CSS-пикселях, как иконка на экране «Домой» (~60 pt) с запасом.
const SPLASH_MARK_CSS_PX = 112;

async function renderIcon(sizePx: number): Promise<Buffer> {
  return sharp(ICON_PNG).resize(sizePx, sizePx, { kernel: "lanczos3" }).png().toBuffer();
}

type ManifestIcon = { src: string };
type Manifest = { icons: ManifestIcon[]; shortcuts?: { icons?: ManifestIcon[] }[] };

async function writeBrandAssetVersion(version: string): Promise<void> {
  const source = await readFile(VERSION_MODULE, "utf8");
  if (!VERSION_LINE.test(source)) throw new Error(`Не найдена строка BRAND_ASSET_VERSION в ${VERSION_MODULE}`);
  await writeFile(VERSION_MODULE, source.replace(VERSION_LINE, `export const BRAND_ASSET_VERSION = "${version}";`));

  const raw = await readFile(MANIFEST, "utf8");
  const manifest = JSON.parse(raw) as Manifest;
  const icons = [...manifest.icons, ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? [])];
  for (const icon of icons) icon.src = `${icon.src.split("?")[0]}?v=${version}`;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`.replace(/\n/g, eol));
}

async function main(): Promise<void> {
  await sharp(await renderIcon(120)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, "brand", "icon-120.png"));

  // Mail.ru принимает аватар только с непрозрачным фоном — альфа-канал снимается.
  await sharp(EMAIL_AVATAR_SVG, { density: Math.ceil((EMAIL_AVATAR_PX / 100) * 72 * 2) })
    .resize(EMAIL_AVATAR_PX, EMAIL_AVATAR_PX)
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, "brand", "email-avatar-512.png"));

  await mkdir(path.join(PUBLIC_DIR, "splash"), { recursive: true });
  for (const device of APPLE_SPLASH_DEVICES) {
    const { width, height } = appleSplashPixelSize(device);
    const markPx = SPLASH_MARK_CSS_PX * device.ratio;
    // Фон — первый кадр страницы (`--bg-page`): заставка должна перетекать в
    // интерфейс, а не быть отдельным экраном (Apple HIG, Launch screen).
    await sharp({ create: { width, height, channels: 3, background: BRAND_COLORS.surfacePage } })
      .composite([
        {
          input: await renderIcon(markPx),
          left: Math.round((width - markPx) / 2),
          top: Math.round((height - markPx) / 2),
        },
      ])
      .png({ compressionLevel: 9, palette: true, quality: 100 })
      .toFile(path.join(PUBLIC_DIR, appleSplashUrl(device)));
  }

  // Последним: отпечаток считается по уже собранным файлам.
  await writeBrandAssetVersion(computeBrandAssetFingerprint(PUBLIC_DIR));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
