// Живая проверка пакета 2026-10-01: сессия PWA, запрещённые слова, админка,
// выгрузка в Excel, 375 px, SEO.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { ROLES, type RoleKey } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const OUT = ".qa/diagnostics/backlog-batch-2026-10-01";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const notes: string[] = [];

async function login(browser: Browser, key: RoleKey, mobile = false): Promise<Page> {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "ru-RU" }
      : { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "ru-RU" },
  );
  const page = await ctx.newPage();
  await loginAs(page, ROLES.find((r) => r.key === key)!, BASE, { channel: "phone" });
  return page;
}

async function go(page: Page, url: string): Promise<void> {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, { timeout: 90_000 })
    .catch(() => {});
}

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe.configure({ timeout: 600_000 });
test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});
test.afterAll(() => writeFileSync(path.join(OUT, "notes.txt"), notes.join("\n")));

test("сессия: сбой /api/me не превращает вошедшего в гостя (PWA, нижняя навигация)", async ({ browser }) => {
  // От `useMe` зависит нижняя навигация — то, что человек видит в PWA на телефоне.
  const elena = await login(browser, "client", true);
  const bottomNav = elena.locator("nav.fixed.bottom-0");
  await go(elena, "/");
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });
  await expect(bottomNav.getByRole("link", { name: "Войти" })).toHaveCount(0);

  // Возврат из фона без сети: /api/me не отвечает при открытии страницы.
  await elena.route("**/api/me", (route) => route.abort("internetdisconnected"));
  await go(elena, "/catalog");
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });
  await elena.waitForTimeout(4_000);
  const loginTabs = await bottomNav.getByRole("link", { name: "Войти" }).count();
  notes.push(`/api/me failed on open: login tabs in bottom nav = ${loginTabs}`);
  await elena.screenshot({ path: path.join(OUT, "pwa-bottom-nav-me-failed.png") });
  expect(loginTabs).toBe(0);
  await elena.context().close();

  // Контроль: настоящий гость по-прежнему видит «Войти».
  const guestCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await guestCtx.addCookies([
    { name: "mr_cookie_notice", value: "1.0:n", url: BASE },
    { name: "mr-city-slug", value: "moscow", url: BASE },
  ]);
  const guest = await guestCtx.newPage();
  await go(guest, "/catalog");
  await expect(guest.locator("nav.fixed.bottom-0").getByRole("link", { name: "Войти" })).toHaveCount(1, { timeout: 60_000 });
  await guestCtx.close();
});

test("запрещённые слова: имя мастера и адрес страницы", async ({ browser }) => {
  const anna = await login(browser, "master");
  const profile = await anna.request.patch(`${BASE}/api/master/profile`, {
    data: { displayName: "Анна хуй" },
    headers: { origin: BASE },
  });
  const profileBody = (await profile.json()) as { error?: { code?: string; message?: string } };
  notes.push(`profile PATCH: ${profile.status()} ${JSON.stringify(profileBody.error)}`);
  expect(profile.status()).toBe(422);
  expect(profileBody.error?.code).toBe("FORBIDDEN_WORDS");
  expect(profileBody.error?.message).toBe("Уберите недопустимые слова и попробуйте ещё раз.");

  const username = await anna.request.post(`${BASE}/api/cabinet/master/public-username`, {
    data: { username: "anna-huy" },
    headers: { origin: BASE },
  });
  const usernameBody = await username.text();
  notes.push(`username POST: ${username.status()} ${usernameBody.slice(0, 200)}`);
  expect(username.ok()).toBe(false);
  expect(usernameBody).toContain("нельзя использовать");

  // Обычное слово, похожее на корень, проходит проверку (ответ — не FORBIDDEN_WORDS).
  const pedicure = await anna.request.patch(`${BASE}/api/master/profile`, {
    data: { tagline: "Аппаратный педикюр и маникюр" },
    headers: { origin: BASE },
  });
  notes.push(`tagline «педикюр»: ${pedicure.status()}`);
  expect(pedicure.status()).toBe(200);
  await anna.context().close();
});

test("админка: состояние системы, история событий, выгрузка, дата регистрации", async ({ browser }) => {
  const admin = await login(browser, "site-admin");
  await go(admin, "/admin");
  for (const label of ["Платформа", "Фоновые задачи", "Интеграции", "База данных", "Redis", "Процесс приложения", "Расход ИИ за сутки"]) {
    await expect(admin.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  }
  const table = admin.locator("table").filter({ has: admin.getByRole("columnheader", { name: "Подробности" }) });
  await expect(table).toBeVisible();
  const rowsBefore = await table.locator("tbody tr").count();
  const loadMore = admin.getByRole("button", { name: "Показать ещё" });
  let rowsAfter = rowsBefore;
  if (await loadMore.isVisible().catch(() => false)) {
    await loadMore.click();
    await expect.poll(() => table.locator("tbody tr").count(), { timeout: 30_000 }).toBeGreaterThan(rowsBefore);
    rowsAfter = await table.locator("tbody tr").count();
  }
  notes.push(`events rows: ${rowsBefore} → ${rowsAfter}`);
  await admin.screenshot({ path: path.join(OUT, "admin-dashboard.png"), fullPage: true });

  const exportRes = await admin.request.get(`${BASE}/api/admin/dashboard/events/export?days=90`);
  const body = await exportRes.body();
  notes.push(
    `export: ${exportRes.status()} ${exportRes.headers()["content-type"]} ${exportRes.headers()["content-disposition"]} bytes=${body.length}`,
  );
  expect(exportRes.status()).toBe(200);
  expect(exportRes.headers()["content-type"]).toContain("spreadsheetml");
  expect(body.subarray(0, 2).toString()).toBe("PK");
  writeFileSync(path.join(OUT, "events.xlsx"), body);

  const bad = await admin.request.get(`${BASE}/api/admin/dashboard/events/export?days=5`, { maxRedirects: 0 });
  notes.push(`export bad days: ${bad.status()} → ${bad.headers()["location"]}`);
  expect(bad.status()).toBe(303);
  expect(bad.headers()["location"]).toContain("/admin?eventsExport=invalid");

  await go(admin, "/admin/users");
  // Дата по часам зрителя появляется после гидратации — ждём её, а не читаем сразу.
  const firstTime = admin.locator("table tbody tr").first().locator("time");
  await expect(firstTime).toHaveText(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/, { timeout: 60_000 });
  notes.push(`users first created: ${await firstTime.innerText()}`);
  await admin.context().close();
});

test("375 px: аналитика мастера и шаги записи в студию", async ({ browser }) => {
  const anna = await login(browser, "master", true);
  await go(anna, "/cabinet/master/analytics");
  await anna.waitForTimeout(2_000);
  const analytics = await overflow(anna);
  notes.push(`analytics 375: ${JSON.stringify(analytics)}`);
  await anna.screenshot({ path: path.join(OUT, "analytics-375.png") });
  expect(analytics.scrollWidth).toBeLessThanOrEqual(analytics.clientWidth);

  await go(anna, "/u/vision-studio/booking");
  await anna.waitForTimeout(2_000);
  const service = anna.getByRole("button").filter({ hasText: /₽/ }).first();
  if (await service.isVisible().catch(() => false)) {
    await service.click();
    await anna.waitForTimeout(1_500);
  }
  const steps = await overflow(anna);
  notes.push(`studio steps 375: ${JSON.stringify(steps)}`);
  await anna.screenshot({ path: path.join(OUT, "studio-steps-375.png") });
  expect(steps.scrollWidth).toBeLessThanOrEqual(steps.clientWidth);
  await anna.context().close();
});

test("SEO: sitemap и разметка сайта", async ({ request }) => {
  const sitemap = await (await request.get(`${BASE}/sitemap.xml`)).text();
  expect(sitemap).toContain("/consent</loc>");
  expect(sitemap).not.toContain("/careers</loc>");
  const home = await (await request.get(`${BASE}/`)).text();
  expect(home).toContain('"SearchAction"');
  expect(home).toContain('"Organization"');
  notes.push(`sitemap urls: ${(sitemap.match(/<loc>/g) ?? []).length}`);
});
