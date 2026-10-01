// 29.09 доработки · 28 — выбор часового пояса только РФ, живьём.
//
//  1. Мастер (`+7 999 100 00 00`) — «Часовой пояс» в «Локации»: 12 зон РФ, ни
//     одной СНГ; 375 светлая и 1280 тёмная.
//  2. Админ (`+7 999 400 00 00`) — «Добавить город»: все зоны РФ, без СНГ.
//  3. Город на старой зоне СНГ (заводится SQL-ом на время прогона) — его зона
//     видна первой («Алматы (Asia/Almaty)»), правка на другую СНГ-зону — 422,
//     сохранение без смены зоны — проходит.
//
// Город-фикстура удаляется в конце (и при падении — в afterAll).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { ROLES, type Role } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = process.env.SPEC28_OUT ?? ".qa/diagnostics/spec28";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const CIS = ["Asia/Almaty", "Asia/Tashkent", "Asia/Bishkek", "Europe/Minsk"];
const FIXTURE_SLUG = "qa-spec28-almaty";

const states = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function contextFor(browser: Browser, role: Role, width: number, theme: "light" | "dark") {
  if (!states.has(role.key)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, role, BASE);
    states.set(role.key, await ctx.storageState());
    await ctx.close();
  }
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    storageState: states.get(role.key),
  });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  return ctx;
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
  psql(`delete from "City" where slug = '${FIXTURE_SLUG}'`);
});

test.afterAll(() => {
  psql(`delete from "City" where slug = '${FIXTURE_SLUG}'`);
});

test.describe.configure({ timeout: 600_000 });

test("мастер: в списке поясов только Россия", async ({ browser }) => {
  const master = ROLES.find((r) => r.key === "master")!;
  for (const [width, theme] of [
    [375, "light"],
    [1280, "dark"],
  ] as const) {
    const ctx = await contextFor(browser, master, width, theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/cabinet/master/profile`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const select = page.getByRole("combobox", { name: "Часовой пояс" });
    await expect(select).toBeVisible({ timeout: 60_000 });
    const values = await select.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    expect(values).toHaveLength(12);
    expect(values.filter((v) => CIS.includes(v))).toEqual([]);
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `master-${width}-${theme}.png`) });
    await ctx.close();
  }
});

test("админка: новый город — зоны РФ; старый город на зоне СНГ её сохраняет, сменить на СНГ нельзя", async ({
  browser,
}) => {
  const admin = ROLES.find((r) => r.key === "site-admin")!;
  const ctx = await contextFor(browser, admin, 1280, "light");
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin/cities`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const add = page.getByRole("button", { name: "Добавить город" });
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const createValues = await page
    .getByRole("dialog")
    .locator("select")
    .first()
    .locator("option")
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(createValues).toContain("Europe/Volgograd");
  expect(createValues).toContain("Asia/Novokuznetsk");
  expect(createValues.filter((v) => CIS.includes(v))).toEqual([]);
  await page.screenshot({ path: path.join(OUT, "admin-create-1280.png") });
  await page.keyboard.press("Escape");

  psql(
    `insert into "City" (id, slug, name, latitude, longitude, timezone, "isActive", "sortOrder", "autoCreated", "createdAt", "updatedAt") ` +
      `values ('${FIXTURE_SLUG}', '${FIXTURE_SLUG}', 'Алматы QA', 43.24, 76.95, 'Asia/Almaty', false, 999, true, now(), now())`,
  );
  await page.goto(`${BASE}/admin/cities?selected=${FIXTURE_SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const tzSelect = page.locator("select").filter({ has: page.locator('option[value="Asia/Almaty"]') }).first();
  await expect(tzSelect).toBeVisible({ timeout: 60_000 });
  const first = await tzSelect.locator("option").first().evaluate((el) => ({
    value: (el as HTMLOptionElement).value,
    label: el.textContent,
  }));
  expect(first).toEqual({ value: "Asia/Almaty", label: "Алматы (Asia/Almaty)" });
  await page.screenshot({ path: path.join(OUT, "admin-edit-cis-1280.png") });

  // API в обход интерфейса: смена на другую СНГ-зону — 422, та же зона — проходит.
  const refused = await page.request.patch(`${BASE}/api/admin/cities/${FIXTURE_SLUG}`, {
    data: { timezone: "Asia/Tashkent" },
  });
  expect(refused.status()).toBe(422);
  const kept = await page.request.patch(`${BASE}/api/admin/cities/${FIXTURE_SLUG}`, {
    data: { timezone: "Asia/Almaty", sortOrder: 998 },
  });
  expect(kept.status()).toBe(200);
  await ctx.close();
});
