// 29.09 доработки · 24 (UI-20) — живая проверка форматов дат и денег.
//
// Зритель — Москва (`timezoneId`), салон — Vision (Екатеринбург, GMT+5): на
// одной Москве ошибка пояса не видна (скилл timezone-correctness §5). Каждый
// экран — 375 и 1280. Снимки — в SPEC24_OUT (по умолчанию .qa/diagnostics/spec24).
//
// Проверки текстом экрана (expect.soft — снимки снимаются все, итог по всем):
//  - нет «цифра + ОБЫЧНЫЙ пробел + ₽» (решение 24.2: перед ₽ неразрывный);
//  - нет латинских сокращений сумм «12K» / «1.2M» (решение 24.1);
//  - шаг «Мастер» записи в студию показывает метку «(Екатеринбург, GMT+5)»;
//  - поле цены в редакторе тарифа (админка) — число без «₽» (находка спеки).
//
// SSE в кабинетах — никаких networkidle (скилл playwright-qa §5).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ROLES, type Role } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const OUT = process.env.SPEC24_OUT ?? ".qa/diagnostics/spec24";
const VIEWER_TZ = "Europe/Moscow";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 900 },
] as const;

const PLAIN_SPACE_RUBLE = /\d ₽/;
const LATIN_MONEY_SHORT = /\b\d+(?:[.,]\d)?[KkMm]\b/;

const states = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function contextFor(browser: Browser, width: number, height: number, role?: Role): Promise<BrowserContext> {
  const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
  if (role && !states.has(role.key)) {
    const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: VIEWER_TZ });
    const page = await loginCtx.newPage();
    await loginAs(page, role, base);
    states.set(role.key, await loginCtx.storageState());
    await loginCtx.close();
  }
  const ctx = await browser.newContext({
    viewport: { width, height },
    timezoneId: VIEWER_TZ,
    storageState: role ? states.get(role.key) : undefined,
  });
  // Окно выбора города и cookie-уведомление первого визита — как в `loginAs`.
  await ctx.addCookies([
    { name: "mr-city-slug", value: "moscow", url: base },
    { name: "mr_cookie_notice", value: "1.0:n", url: base },
  ]);
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
    } catch {
      // cookie всё равно подавляет окно города
    }
  });
  return ctx;
}

async function open(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }); // dev компилирует на лету
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_500); // клиентские острова догружают данные
  return page.locator("body").innerText();
}

function checkMoney(text: string, where: string): void {
  const plain = text.match(new RegExp(`.{0,24}${PLAIN_SPACE_RUBLE.source}`));
  expect.soft(plain?.[0] ?? null, `${where}: обычный пробел перед ₽`).toBeNull();
  const latin = text.match(LATIN_MONEY_SHORT);
  expect.soft(latin?.[0] ?? null, `${where}: латинское сокращение суммы`).toBeNull();
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test.describe.configure({ timeout: 300_000 });

// `prices: true` — экран обязан показать хотя бы одну сумму «N ₽» с неразрывным
// пробелом: без этого проверка «нет обычного пробела» была бы пустой.
const PAGES: Array<{ key: string; url: string; role?: Role["key"]; prices?: boolean }> = [
  { key: "home", url: "/", prices: true },
  { key: "catalog", url: "/catalog", prices: true },
  { key: "studio-public", url: "/u/vision-studio", prices: true },
  { key: "client-bookings", url: "/cabinet/bookings", role: "client" },
  { key: "studio-dashboard", url: "/cabinet/studio", role: "studio-admin" },
  { key: "studio-bookings", url: "/cabinet/studio/bookings", role: "studio-admin" },
  { key: "master-dashboard", url: "/cabinet/master/dashboard", role: "master" },
  { key: "master-analytics", url: "/cabinet/master/analytics", role: "master" },
  { key: "master-clients", url: "/cabinet/master/clients", role: "master" },
  { key: "admin-dashboard", url: "/admin", role: "site-admin" },
  { key: "admin-billing", url: "/admin/billing", role: "site-admin", prices: true },
];

test("экраны: деньги и даты — 375 и 1280", async ({ browser }) => {
  const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
  for (const vp of VIEWPORTS) {
    for (const item of PAGES) {
      const role = item.role ? ROLES.find((r) => r.key === item.role)! : undefined;
      const ctx = await contextFor(browser, vp.width, vp.height, role);
      const page = await ctx.newPage();
      let text = await open(page, `${base}${item.url}`);
      if (item.prices) {
        // Dev компилирует роуты при первом запросе — ждём данные, а не время.
        await expect
          .poll(async () => page.locator("body").innerText(), { timeout: 90_000 })
          .toMatch(/\d\u00a0\u20bd/)
          .catch(() => undefined);
        text = await page.locator("body").innerText();
        expect.soft(text, `${item.key}@${vp.name}: сумма с неразрывным пробелом`).toMatch(/\d\u00a0\u20bd/);
      }
      checkMoney(text, `${item.key}@${vp.name}`);
      await page.screenshot({ path: path.join(OUT, `${item.key}-${vp.name}.png`), fullPage: true });
      await ctx.close();
    }
  }
});

test("запись в студию Vision: метка пояса на шаге «Мастер» и даты по салону", async ({ browser }) => {
  const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
  for (const vp of VIEWPORTS) {
    const ctx = await contextFor(browser, vp.width, vp.height);
    const page = await ctx.newPage();
    await open(page, `${base}/u/vision-studio/booking`);
    await page.screenshot({ path: path.join(OUT, `studio-booking-service-${vp.name}.png`), fullPage: true });
    // У «Маникюр классический» в сиде есть окошки сегодня (Марина Лебедева).
    await page.locator("li button[aria-pressed]", { hasText: "Маникюр классический" }).first().click();
    const next = page.getByRole("button", { name: /^(Далее|Продолжить)/ });
    if (await next.first().isVisible().catch(() => false)) await next.first().click();
    // Превью ближайшего окошка: «1 окт., 14:30 (Екатеринбург, GMT+5)» — по часам салона.
    const preview = /\d{1,2} [а-я]+\.?, \d{2}:\d{2} \(Екатеринбург, GMT\+5\)/;
    await expect
      .poll(async () => page.locator("body").innerText(), { timeout: 90_000 })
      .toMatch(preview)
      .catch(() => undefined);
    const text = await page.locator("body").innerText();
    await page.screenshot({ path: path.join(OUT, `studio-booking-master-${vp.name}.png`), fullPage: true });
    expect.soft(text, `превью окошка по салону с меткой пояса @${vp.name}`).toMatch(preview);
    checkMoney(text, `studio-booking@${vp.name}`);
    await ctx.close();
  }
});

test("админка: поле цены тарифа — число без «₽» (сохранится без перепечатки)", async ({ browser }) => {
  const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
  const admin = ROLES.find((r) => r.key === "site-admin")!;
  const ctx = await contextFor(browser, 1280, 900, admin);
  const page = await ctx.newPage();
  await open(page, `${base}/admin/billing`);
  await page.getByRole("button", { name: "Редактировать" }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "admin-plan-edit-1280.png") });
  const values = await dialog.locator("input").evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value),
  );
  const withRuble = values.filter((v) => v.includes("₽"));
  expect(withRuble, "поля цены не содержат ₽").toEqual([]);
  expect(values.some((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0), "есть ненулевая цена числом").toBe(true);
  await ctx.close();
});
