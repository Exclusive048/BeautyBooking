// SCHEDULE-HOURS-TAB-REMOVAL (решение владельца 2026-10-01) — живая проверка.
//
// Вкладки «Часы» в настройках расписания больше нет ни у мастера, ни у студии:
// неделю задаёт окно «Настроить график», даты — календарь, а «Шаг окошек»
// переехал в «Правила записи» (секция «Когда можно записаться»).
//
// Проверяется:
//  1. мастер (`+7 999 100 00 00`): вкладки «Календарь / Перерывы / Правила /
//     Видимость», «Часов» нет; `?tab=hours` открывает календарь;
//  2. «Правила»: строка «Шаг окошек» — смена шага сохраняется автоматически
//     (значение в БД меняется), затем прежнее значение возвращается;
//  3. студия (`+7 999 200 00 00`): тот же набор вкладок и тот же переход.
// Снимки: 1440 светлая и 390 тёмная. Каталог — HOURS_TAB_OUT.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { ROLES, type RoleKey } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = process.env.HOURS_TAB_OUT ?? ".qa/diagnostics/schedule-hours-tab-removal";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const TABS = ["Календарь", "Перерывы", "Правила", "Видимость"];
const STEP_LABEL: Record<number, string> = { 15: "15 мин", 30: "30 мин", 60: "1 час" };

const MASTER_SLOT_STEP_SQL =
  `select p."slotStepMin" from "Provider" p join "MasterProfile" mp on mp."providerId" = p.id ` +
  `join "UserProfile" u on u.id = p."ownerUserId" where u.phone = '+79991000000'`;

async function login(browser: Browser, key: RoleKey, width: number, theme: "light" | "dark"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await loginAs(page, ROLES.find((r) => r.key === key)!, BASE);
  return page;
}

async function expectTabs(page: Page): Promise<void> {
  const main = page.getByTestId("page-main");
  for (const name of TABS) {
    await expect(main.getByRole("button", { name, exact: true }).first()).toBeVisible({ timeout: 60_000 });
  }
  await expect(main.getByRole("button", { name: "Часы", exact: true })).toHaveCount(0);
}

async function expectActiveTab(page: Page, name: string): Promise<void> {
  await expect(
    page.getByTestId("page-main").getByRole("button", { name, exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
}

test.describe.configure({ timeout: 600_000 });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test("мастер: без «Часов», шаг окошек в «Правилах»", async ({ browser }) => {
  const page = await login(browser, "master", 1440, "light");
  const settings = `${BASE}/cabinet/master/schedule/settings`;

  await page.goto(settings, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectTabs(page);
  await expectActiveTab(page, "Календарь");

  await page.goto(`${settings}?tab=hours`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectActiveTab(page, "Календарь");

  await page.goto(`${settings}?tab=rules`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectActiveTab(page, "Правила");
  const row = page.getByText("Шаг окошек", { exact: true });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "master-rules-1440-light.png") });

  const before = Number(psql(MASTER_SLOT_STEP_SQL).trim());
  const next = before === 30 ? 60 : 30;
  // Строка «Шаг окошек» — самый внутренний блок с подписью и чипом «15 мин»:
  // «1 час» есть и в строке «Минимум за» той же секции.
  const section = page
    .locator("div", { has: row })
    .filter({ has: page.getByRole("button", { name: "15 мин", exact: true }) })
    .last();
  await section.getByRole("button", { name: STEP_LABEL[next], exact: true }).click();
  await expect.poll(() => Number(psql(MASTER_SLOT_STEP_SQL).trim()), { timeout: 30_000 }).toBe(next);

  await section.getByRole("button", { name: STEP_LABEL[before], exact: true }).click();
  await expect.poll(() => Number(psql(MASTER_SLOT_STEP_SQL).trim()), { timeout: 30_000 }).toBe(before);
  await page.context().close();

  const mobile = await login(browser, "master", 390, "dark");
  await mobile.goto(`${settings}?tab=rules`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const mobileRow = mobile.getByText("Шаг окошек", { exact: true });
  await expect(mobileRow).toBeVisible({ timeout: 60_000 });
  await mobileRow.scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: path.join(OUT, "master-rules-390-dark.png") });
  await mobile.goto(settings, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectTabs(mobile);
  await mobile.screenshot({ path: path.join(OUT, "master-tabs-390-dark.png") });
  await mobile.context().close();
});

test("студия: тот же набор вкладок", async ({ browser }) => {
  const page = await login(browser, "studio-admin", 1440, "light");
  const settings = `${BASE}/cabinet/studio/schedule/settings`;
  await page.goto(settings, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectTabs(page);
  await expectActiveTab(page, "Календарь");
  await page.screenshot({ path: path.join(OUT, "studio-tabs-1440-light.png") });

  await page.goto(`${settings}?tab=hours`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expectActiveTab(page, "Календарь");
  await page.context().close();
});
