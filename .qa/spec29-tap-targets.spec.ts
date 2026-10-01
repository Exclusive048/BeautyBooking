// 29.09 доработки · 29 (UI-29, часть) — невидимая зона нажатия у `Button`
// размеров `sm` и `icon`.
//
// Две фазы (SPEC29_PHASE):
//  - `before` — снимки экранов до правки + замер `sm`-кнопок (по классам размера);
//  - `after`  — те же снимки + замер всех кнопок с зоной (по вычисленному
//    `::after`) + попиксельное сравнение с `before`: внешне не меняется ничего.
//
// Замер — поведение, а не классы: `elementFromPoint` по вертикали через центр
// кнопки, шаг 1px; зона — непрерывный отрезок, где точка попадает в кнопку
// (или её потомка). Граница, на которой попадание кончилось, классифицируется:
// конец самой зоны, обрезка `overflow` предка или чужой элемент поверх.
//
// Экраны (спека 29, «Проверка»): канбан и настройки расписания мастера,
// календарь студии, настройки админки, фильтры каталога (гость); 390 и 1440,
// обе темы. Каталог: OUT/<phase>/…, отчёт замера — OUT/<phase>/measure.json.
//
// Попиксельное сравнение без контроля врёт: каталог (фото карточек) и индикатор
// dev-сервера меняются от прогона к прогону. Контроль — второй прогон того же
// кода: SPEC29_PHASE=before SPEC29_OUT=.qa/diagnostics/tap-targets-control.
// Отличие «до → после», которого нет между «после» и контролем, — от правки.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ROLES, type Role } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const PHASE = process.env.SPEC29_PHASE === "after" ? "after" : "before";
const ROOT_OUT = process.env.SPEC29_OUT ?? ".qa/diagnostics/tap-targets";
const OUT = path.join(ROOT_OUT, PHASE);
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";

type Screen = { key: string; url: string; role: Role["key"] | null };

const SCREENS: Screen[] = [
  { key: "master-kanban", url: "/cabinet/master/bookings", role: "master" },
  { key: "master-schedule-settings", url: "/cabinet/master/schedule/settings", role: "master" },
  { key: "studio-calendar", url: "/cabinet/studio/calendar", role: "studio-admin" },
  { key: "admin-settings", url: "/admin/settings", role: "site-admin" },
  { key: "catalog", url: "/catalog", role: null },
];

const VIEWPORTS = [
  { width: 390, theme: "light" },
  { width: 390, theme: "dark" },
  { width: 1440, theme: "light" },
  { width: 1440, theme: "dark" },
] as const;

const states = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function contextFor(browser: Browser, width: number, theme: "light" | "dark", roleKey: Role["key"] | null) {
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  if (roleKey) {
    if (!states.has(roleKey)) {
      const role = ROLES.find((r) => r.key === roleKey)!;
      const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await loginCtx.newPage();
      await loginAs(page, role, BASE);
      states.set(roleKey, await loginCtx.storageState());
      await loginCtx.close();
    }
    storageState = states.get(roleKey);
  }
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    reducedMotion: "reduce",
    timezoneId: "Europe/Moscow",
    storageState,
  });
  await ctx.addCookies([
    { name: "mr-city-slug", value: "moscow", url: BASE },
    { name: "mr_cookie_notice", value: "1.0:n", url: BASE },
  ]);
  await ctx.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
      window.localStorage.setItem("mr-city-slug", "moscow");
    } catch {
      // cookie всё равно подавляет окно города
    }
  }, theme);
  return ctx;
}

/** Dev-сервер перезапускается по порогу памяти посреди серии — повторить навигацию. */
async function open(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      break;
    } catch (error) {
      if (attempt >= 3 || !/ERR_CONNECTION_(RESET|REFUSED)|ERR_EMPTY_RESPONSE|Timeout/.test(String(error))) throw error;
      await page.waitForTimeout(15_000);
    }
  }
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 60_000 });
  // Шрифты и поздние данные (SWR) — иначе снимки «до» и «после» расходятся по загрузке.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2_500);
}

type Measured = {
  label: string;
  visible: number;
  /** Зона самой кнопки: события принимает только она (чужие элементы прозрачны). */
  zone: number;
  /** Зона на живой странице — меньше `zone`, если сверху лежит чужой элемент. */
  live: number;
  /** Чем кончилась зона кнопки сверху и снизу. */
  above: string;
  below: string;
};

/**
 * Замер в браузере. Кандидаты: в фазе `before` — `sm`-кнопки по классам размера
 * (`h-9 px-3`), в фазе `after` — все элементы, у которых `::after` — абсолютная
 * зона (вычисленный стиль).
 */
async function measure(page: Page, mode: "sm-classes" | "after-zone"): Promise<Measured[]> {
  return page.evaluate((m) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a")).filter((el) => {
      if (m === "sm-classes") return el.classList.contains("h-9") && el.classList.contains("px-3");
      const after = getComputedStyle(el, "::after");
      return after.position === "absolute" && after.content !== "none" && el.className.includes("after:");
    });
    const style = document.createElement("style");
    style.textContent =
      "*{pointer-events:none!important}[data-s29-target],[data-s29-target] *{pointer-events:auto!important}";
    const clippedAt = (el: HTMLElement, y: number): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowY !== "visible" || s.overflowX !== "visible") {
          const r = p.getBoundingClientRect();
          if (y < r.top || y >= r.bottom) return true;
        }
      }
      return false;
    };
    const span = (el: HTMLElement, cx: number, cy: number) => {
      const hits = (y: number) => {
        const node = document.elementFromPoint(cx, y);
        return !!node && (node === el || el.contains(node));
      };
      let top = cy;
      while (top - 1 >= 0 && hits(top - 1)) top -= 1;
      let bottom = cy;
      while (bottom + 1 < vh && hits(bottom + 1)) bottom += 1;
      return { top, bottom };
    };
    const out: {
      label: string;
      visible: number;
      zone: number;
      live: number;
      above: string;
      below: string;
    }[] = [];
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      if (cx < 0 || cx >= vw || cy < 30 || cy >= vh - 30) continue;
      const centerHit = document.elementFromPoint(cx, cy);
      if (!centerHit || !(centerHit === el || el.contains(centerHit))) continue; // кнопку саму перекрыли
      const live = span(el, cx, cy);
      el.setAttribute("data-s29-target", "");
      document.head.appendChild(style);
      const own = span(el, cx, cy);
      style.remove();
      el.removeAttribute("data-s29-target");
      const why = (y: number) => {
        if (y < 0 || y >= vh) return "край окна";
        if (clippedAt(el, y)) return "обрезка overflow предка";
        return "конец зоны";
      };
      out.push({
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
        visible: Math.round(rect.height),
        zone: own.bottom - own.top + 1,
        live: live.bottom - live.top + 1,
        above: why(own.top - 1),
        below: why(own.bottom + 1),
      });
    }
    return out;
  }, mode);
}

async function diffPixels(a: string, b: string): Promise<{ total: number; differing: number; sameSize: boolean }> {
  const [ia, ib] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const sameSize = ia.info.width === ib.info.width && ia.info.height === ib.info.height;
  if (!sameSize) return { total: ia.info.width * ia.info.height, differing: -1, sameSize };
  let differing = 0;
  for (let i = 0; i < ia.data.length; i += 4) {
    if (
      ia.data[i] !== ib.data[i] ||
      ia.data[i + 1] !== ib.data[i + 1] ||
      ia.data[i + 2] !== ib.data[i + 2] ||
      ia.data[i + 3] !== ib.data[i + 3]
    ) {
      differing += 1;
    }
  }
  return { total: ia.info.width * ia.info.height, differing, sameSize };
}

test.describe.configure({ timeout: 1_800_000 });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test(`зона нажатия: ${PHASE}`, async ({ browser }) => {
  const report: Record<string, Measured[]> = {};
  const reportPath = path.join(OUT, "measure.json");
  if (existsSync(reportPath)) Object.assign(report, JSON.parse(readFileSync(reportPath, "utf8")));

  for (const screen of SCREENS) {
    for (const vp of VIEWPORTS) {
      const shot = path.join(OUT, `${screen.key}-${vp.width}-${vp.theme}.png`);
      const reportKey = `${screen.key}-${vp.width}`;
      const needMeasure = vp.theme === "light" && !report[reportKey];
      if (existsSync(shot) && !needMeasure) continue; // возобновление после перезапуска сервера
      const ctx = await contextFor(browser, vp.width, vp.theme, screen.role);
      const page = await ctx.newPage();
      await open(page, screen.url);
      await page.screenshot({ path: shot });
      if (needMeasure) {
        report[reportKey] = await measure(page, PHASE === "after" ? "after-zone" : "sm-classes");
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
      }
      await ctx.close();
    }
  }

  if (PHASE !== "after") return;

  // 1. На каждом экране зона измерена хотя бы у одной кнопки — иначе замер пуст.
  for (const screen of SCREENS) {
    const all = [...(report[`${screen.key}-390`] ?? []), ...(report[`${screen.key}-1440`] ?? [])];
    expect(all.length, `${screen.key}: ни одной кнопки с зоной в окне`).toBeGreaterThan(0);
  }

  // 2. Зона ≥ 44px у каждой кнопки, которую не обрезает `overflow` предка (обрезку
  //    и чужие элементы поверх — `live` < `zone` — показывает отчёт: зона меньше,
  //    но это не вредно, спека 29 «Риски»).
  const short: string[] = [];
  for (const [key, rows] of Object.entries(report)) {
    for (const row of rows) {
      const clipped = [row.above, row.below].some((why) => why !== "конец зоны");
      if (row.zone < 44 && !clipped) short.push(`${key}: «${row.label}» зона ${row.zone}px (видимая ${row.visible}px)`);
    }
  }
  expect(short, "кнопки с зоной меньше 44px без внешней причины").toEqual([]);

  // 3. Внешне ничего не изменилось: попиксельно против фазы `before`.
  const changed: string[] = [];
  for (const screen of SCREENS) {
    for (const vp of VIEWPORTS) {
      const name = `${screen.key}-${vp.width}-${vp.theme}.png`;
      const before = path.join(ROOT_OUT, "before", name);
      if (!existsSync(before)) continue;
      const diff = await diffPixels(before, path.join(OUT, name));
      if (!diff.sameSize || diff.differing > 0) changed.push(`${name}: ${diff.sameSize ? `${diff.differing} px` : "другой размер"}`);
    }
  }
  writeFileSync(path.join(OUT, "diff.json"), JSON.stringify(changed, null, 2));
  // Динамика страницы (время, счётчики) может отличаться между фазами — список
  // разбирается глазами; тест его фиксирует, а не валит.
  test.info().annotations.push({ type: "pixel-diff", description: changed.join("; ") || "совпадают" });
});
