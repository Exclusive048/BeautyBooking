// 29.09 доработки · 25 (UI-22) — шкала мелкого шрифта и радиусов.
//
// Снимает «до» и «после» по экранам с наибольшим числом сайтов (спека 25,
// «Проверка»): вычисленные стили каждого видимого элемента (размер, разрядка,
// гарнитура, регистр, цвет, радиусы) — в JSON, плюс полный снимок экрана.
// Механическая замена `text-[10px]` → `text-3xs` обязана дать те же стили;
// где меняются разрядка или появляется `Badge` — разница ожидаема и
// просматривается глазами. Плюс рантайм-ассерт: в документе нет элементов с
// computed `font-size` меньше 10px.
//
// Запуск: SPEC25_LABEL=before|after (каталог .qa/diagnostics/spec25/<label>).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ROLES, type Role } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const LABEL = process.env.SPEC25_LABEL ?? "after";
const OUT = path.join(".qa/diagnostics/spec25", LABEL);
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";

const PAGES: Array<{ key: string; url: string; role?: Role["key"] }> = [
  { key: "home", url: "/" },
  { key: "studio-public", url: "/u/vision-studio" },
  { key: "client-bookings", url: "/cabinet/bookings", role: "client" },
  { key: "studio-services", url: "/cabinet/studio/services", role: "studio-admin" },
  { key: "studio-bookings", url: "/cabinet/studio/bookings", role: "studio-admin" },
  { key: "studio-team", url: "/cabinet/studio/schedule/team", role: "studio-admin" },
  { key: "studio-settings", url: "/cabinet/studio/settings", role: "studio-admin" },
  { key: "master-services", url: "/cabinet/master/services", role: "master" },
  { key: "master-clients", url: "/cabinet/master/clients", role: "master" },
  { key: "master-notifications", url: "/cabinet/master/notifications", role: "master" },
  { key: "master-schedule", url: "/cabinet/master/schedule", role: "master" },
  { key: "admin-billing", url: "/admin/billing", role: "site-admin" },
  { key: "admin-reviews", url: "/admin/reviews", role: "site-admin" },
];

/** Обрыв соединения на перезапуске dev-сервера — повторить после паузы. */
async function gotoWithRetry(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      return;
    } catch (error) {
      if (attempt >= 3 || !/ERR_CONNECTION_(RESET|REFUSED)|ERR_EMPTY_RESPONSE/.test(String(error))) throw error;
      await page.waitForTimeout(15_000);
    }
  }
}

const states = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function contextFor(
  browser: Browser,
  width: number,
  theme: "light" | "dark",
  role?: Role,
): Promise<BrowserContext> {
  if (role && !states.has(role.key)) {
    const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await loginCtx.newPage();
    await loginAs(page, role, BASE);
    states.set(role.key, await loginCtx.storageState());
    await loginCtx.close();
  }
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    reducedMotion: "reduce",
    timezoneId: "Europe/Moscow",
    storageState: role ? states.get(role.key) : undefined,
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

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test.describe.configure({ timeout: 900_000 });

test("стили мелкого текста и радиусов — снимок по экранам", async ({ browser }) => {
  const tooSmall: string[] = [];
  for (const width of [375, 1280]) {
    for (const theme of ["light", "dark"] as const) {
      for (const item of PAGES) {
        const name = `${item.key}-${width}-${theme}`;
        // Повторный прогон досняет только недостающее: dev-сервер перезапускается
        // по порогу памяти посреди серии (`Server is approaching the used memory
        // threshold, restarting...`), и прогон с нуля стоит ~11 минут.
        if (existsSync(path.join(OUT, `${name}.small.txt`))) continue; // пишется последним
        const role = item.role ? ROLES.find((r) => r.key === item.role)! : undefined;
        const ctx = await contextFor(browser, width, theme, role);
        const page = await ctx.newPage();
        await gotoWithRetry(page, `${BASE}${item.url}`);
        await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(4_000);
        const snapshot = await page.evaluate(() => {
          const rows: string[] = [];
          const small: string[] = [];
          const all = Array.from(document.querySelectorAll("body *")) as HTMLElement[];
          all.forEach((el, index) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            const cs = getComputedStyle(el);
            const ownText = Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
            );
            if (ownText && parseFloat(cs.fontSize) < 10) {
              small.push(`${el.tagName} ${cs.fontSize} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
            }
            const radius = `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`;
            if (!ownText && radius === "0px 0px 0px 0px") return;
            rows.push(
              [
                index,
                el.tagName,
                cs.fontSize,
                cs.lineHeight,
                cs.letterSpacing,
                cs.fontFamily.split(",")[0],
                cs.textTransform,
                cs.color,
                radius,
                (el.textContent ?? "").trim().slice(0, 24),
              ].join(" | "),
            );
          });
          return { rows, small };
        });
        writeFileSync(path.join(OUT, `${name}.txt`), snapshot.rows.join("\n"));
        await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
        writeFileSync(path.join(OUT, `${name}.small.txt`), snapshot.small.map((s) => `${name}: ${s}`).join("\n"));
        await ctx.close();
      }
    }
  }
  // Итог — по всем экранам каталога, в том числе снятым прошлым прогоном.
  for (const file of readdirSync(OUT).filter((f) => f.endsWith(".small.txt")).sort()) {
    tooSmall.push(...readFileSync(path.join(OUT, file), "utf8").split("\n").filter(Boolean));
  }
  writeFileSync(path.join(OUT, "too-small.txt"), tooSmall.join("\n"));
  if (LABEL === "after") expect(tooSmall, "текст мельче 10px").toEqual([]);
});
