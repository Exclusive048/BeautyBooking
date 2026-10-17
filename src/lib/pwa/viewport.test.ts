/**
 * PWA-ZOOM-01 — iOS получает `maximumScale: 1` (гасит автоприближение поля
 * ввода), никто не получает `userScalable: false` (щипок остаётся), Android и
 * десктоп — прежний вьюпорт (Chrome предел щипка соблюдает).
 *
 * @probe 2026-09-23 — `resolveViewport` возвращал `maximumScale: 1` всем:
 * красный «Android и десктоп — без предела». Добавлял `userScalable: false`
 * iOS-ветке: красный «щипок не запрещён никому». Возвращено — зелёный.
 */
import { describe, expect, it } from "vitest";
import { BRAND_COLORS } from "@/lib/ui/brand-colors";
import { parseThemeCookie } from "./theme-cookie";
import { isIosUserAgent, resolveViewport } from "./viewport";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("resolveViewport — PWA-ZOOM-01", () => {
  it("iPhone и iPad получают предел масштаба (нет автоприближения полей)", () => {
    expect(isIosUserAgent(IPHONE)).toBe(true);
    expect(isIosUserAgent(IPAD)).toBe(true);
    expect(resolveViewport(IPHONE).maximumScale).toBe(1);
    expect(resolveViewport(IPAD).maximumScale).toBe(1);
  });

  it("Android и десктоп — без предела: Chrome соблюдал бы его и для щипка", () => {
    for (const ua of [ANDROID, DESKTOP_MAC, "", null, undefined]) {
      expect(resolveViewport(ua).maximumScale).toBeUndefined();
    }
  });

  it("щипок не запрещён никому", () => {
    for (const ua of [IPHONE, IPAD, ANDROID, DESKTOP_MAC]) {
      expect(resolveViewport(ua).userScalable).toBeUndefined();
    }
  });

  it("база не теряется: ширина, масштаб, вырез и тинт хрома на месте", () => {
    const viewport = resolveViewport(IPHONE);
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toHaveLength(2);
  });
});

/**
 * IOS-STATUS-BAR-THEME — тема выбрана явно (кука `mr-theme`): одна мета цвета
 * ВЫБРАННОЙ темы без `media`, иначе полоса статуса на iPhone стартует цветом
 * системной темы. Без куки — прежняя пара по `prefers-color-scheme`.
 *
 * @probe 2026-10-14 — ветка `light` в `themeColorFor` выключена (светлая тема
 * получала пару по системе): 1 failed «светлая тема — светлая полоса, тёмная —
 * тёмная, одна мета без media». Возвращено — 8 passed.
 */
describe("resolveViewport — IOS-STATUS-BAR-THEME", () => {
  it("светлая тема — светлая полоса, тёмная — тёмная, одна мета без media", () => {
    expect(resolveViewport(IPHONE, "light").themeColor).toBe(BRAND_COLORS.surfacePage);
    expect(resolveViewport(IPHONE, "dark").themeColor).toBe(BRAND_COLORS.darkSurfacePage);
    expect(resolveViewport(ANDROID, "dark").themeColor).toBe(BRAND_COLORS.darkSurfacePage);
  });

  it("тема не выбрана — пара по системной настройке", () => {
    expect(resolveViewport(IPHONE, null).themeColor).toHaveLength(2);
    expect(resolveViewport(IPHONE).themeColor).toHaveLength(2);
  });

  it("кука читается только как light / dark", () => {
    expect(parseThemeCookie("light")).toBe("light");
    expect(parseThemeCookie("dark")).toBe("dark");
    for (const value of ["system", "", "DARK", null, undefined]) {
      expect(parseThemeCookie(value)).toBeNull();
    }
  });

  it("предел масштаба iOS сохраняется и с темой", () => {
    expect(resolveViewport(IPHONE, "dark").maximumScale).toBe(1);
    expect(resolveViewport(ANDROID, "dark").maximumScale).toBeUndefined();
  });
});
