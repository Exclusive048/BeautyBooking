/**
 * Заставки iOS для приложения, добавленного на экран «Домой» (PWA-SPLASH-01).
 *
 * Safari показывает `apple-touch-startup-image`, только если `media` совпал с
 * экраном ТОЧНО (CSS-размер, плотность, ориентация); без совпадения — белый
 * экран. До этой правки `layout.tsx` ссылался на четыре `/splash/*.png`, а
 * самих файлов не было: на проде все четыре адреса отдавали 404.
 *
 * Список — единственный источник и для `<head>`, и для генератора
 * (`npm run generate:icons` → `public/splash/`), а
 * `apple-splash.test.ts` проверяет, что за каждым адресом лежит файл нужного
 * размера. Ориентация — только портретная, как у манифеста.
 */

type AppleSplashDevice = {
  /** CSS-ширина экрана в портретной ориентации. */
  width: number;
  /** CSS-высота экрана в портретной ориентации. */
  height: number;
  /** `-webkit-device-pixel-ratio`. */
  ratio: 2 | 3;
};

export const APPLE_SPLASH_DEVICES: readonly AppleSplashDevice[] = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12 / 13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 / 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6 / 7 / 8 Plus
  { width: 375, height: 667, ratio: 2 }, // 6 / 7 / 8, SE 2 / 3
  { width: 320, height: 568, ratio: 2 }, // SE
];

export function appleSplashPixelSize(device: AppleSplashDevice): { width: number; height: number } {
  return { width: device.width * device.ratio, height: device.height * device.ratio };
}

export function appleSplashUrl(device: AppleSplashDevice): string {
  const { width, height } = appleSplashPixelSize(device);
  return `/splash/apple-splash-${width}-${height}.png`;
}

/** `appleWebApp.startupImage` для `metadata` корневого layout. */
export const APPLE_STARTUP_IMAGES = APPLE_SPLASH_DEVICES.map((device) => ({
  url: appleSplashUrl(device),
  media:
    `(device-width: ${device.width}px) and (device-height: ${device.height}px)` +
    ` and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: portrait)`,
}));
