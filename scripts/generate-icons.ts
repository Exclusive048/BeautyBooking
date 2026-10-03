/**
 * Производные иконки из набора `public/brand/` (BRAND-ICONS-02, PWA-SPLASH-01).
 *
 * Сам набор (`favicon.*`, `icon-*.png`, `logo*.svg`, манифест) приходит от
 * дизайнера готовым и этим скриптом не трогается. Здесь — только то, чего в
 * наборе нет:
 *  - `public/brand/icon-120.png` — размер, который Яндекс принимает как
 *    фавиконку (`lib/seo/site-icons.ts`);
 *  - `public/splash/*.png` — заставки iOS для приложения на экране «Домой»
 *    по списку `lib/pwa/apple-splash.ts`.
 *
 * Запуск после замены набора: `npm run generate:icons`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { APPLE_SPLASH_DEVICES, appleSplashPixelSize, appleSplashUrl } from "../src/lib/pwa/apple-splash";
import { BRAND_COLORS } from "../src/lib/ui/brand-colors";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const LOGO_SVG = path.join(PUBLIC_DIR, "brand", "logo.svg");
// Знак на заставке — в CSS-пикселях, как иконка на экране «Домой» (~60 pt) с запасом.
const SPLASH_MARK_CSS_PX = 112;

async function renderLogo(sizePx: number): Promise<Buffer> {
  // Плотность с запасом: растеризация SVG сразу в целевой размер, без апскейла.
  return sharp(LOGO_SVG, { density: Math.max(72, Math.ceil((sizePx / 512) * 72 * 2)) })
    .resize(sizePx, sizePx)
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  await sharp(await renderLogo(120)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, "brand", "icon-120.png"));

  await mkdir(path.join(PUBLIC_DIR, "splash"), { recursive: true });
  for (const device of APPLE_SPLASH_DEVICES) {
    const { width, height } = appleSplashPixelSize(device);
    const markPx = SPLASH_MARK_CSS_PX * device.ratio;
    // Фон — первый кадр страницы (`--bg-page`): заставка должна перетекать в
    // интерфейс, а не быть отдельным экраном (Apple HIG, Launch screen).
    await sharp({ create: { width, height, channels: 3, background: BRAND_COLORS.surfacePage } })
      .composite([
        {
          input: await renderLogo(markPx),
          left: Math.round((width - markPx) / 2),
          top: Math.round((height - markPx) / 2),
        },
      ])
      .png({ compressionLevel: 9, palette: true, quality: 100 })
      .toFile(path.join(PUBLIC_DIR, appleSplashUrl(device)));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
