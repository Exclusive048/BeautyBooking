// WELCOME-DIALOG-01 — живая проверка приветствия этапа тестирования:
// показ после «регистрации» (отметка снята), обе темы на 375 px, закрытие —
// один раз, флаг в админке выключает окно для всех.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { ROLES, type RoleKey } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = ".qa/diagnostics/welcome-dialog";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const CLIENT = ROLES.find((r) => r.key === "client")!;
const notes: string[] = [];

function redisDel(key: string) {
  execFileSync("docker", ["exec", "beautyhub-redis", "redis-cli", "DEL", key], { encoding: "utf8" });
}

/** Как будто аккаунт только что зарегистрирован: отметки нет, кэш /api/me сброшен. */
function resetWelcome(phone: string) {
  const id = psql(`UPDATE "UserProfile" SET "welcomeSeenAt" = NULL WHERE phone = '${phone}' RETURNING id`)
    .split("\n")[0]!
    .trim();
  redisDel(`me:${id}`);
  return id;
}

function seenAt(phone: string) {
  return psql(`SELECT coalesce("welcomeSeenAt"::text, 'NULL') FROM "UserProfile" WHERE phone = '${phone}'`);
}

async function login(browser: Browser, key: RoleKey, theme: "light" | "dark" = "light"): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    locale: "ru-RU",
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await loginAs(page, ROLES.find((r) => r.key === key)!, BASE, { channel: "phone" });
  return page;
}

const dialog = (page: Page) => page.getByRole("dialog", { name: /Добро пожаловать/ });

test.describe.configure({ timeout: 600_000, mode: "serial" });
test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
  psql(`DELETE FROM "SystemConfig" WHERE key = 'welcomeDialogEnabled'`);
  redisDel("system:welcome-dialog-enabled");
});
test.afterAll(() => {
  writeFileSync(path.join(OUT, "notes.txt"), notes.join("\n"));
  // Возврат dev-данных: флаг по умолчанию, у Елены окно закрыто.
  psql(`DELETE FROM "SystemConfig" WHERE key = 'welcomeDialogEnabled'`);
  redisDel("system:welcome-dialog-enabled");
  psql(`UPDATE "UserProfile" SET "welcomeSeenAt" = now() WHERE phone = '${CLIENT.phone}'`);
});

test("после регистрации — окно в обеих темах, закрытие — один раз", async ({ browser }) => {
  for (const theme of ["dark", "light"] as const) {
    resetWelcome(CLIENT.phone);
    const page = await login(browser, "client", theme);
    await expect(dialog(page)).toBeVisible({ timeout: 60_000 });
    await expect(dialog(page)).toContainText("support@masterryadom.ru");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    notes.push(`${theme}: overflow=${overflow}`);
    expect(overflow).toBeLessThanOrEqual(0);
    // Окно открывается с шапки (фокус на заголовке), а не прокрученным вниз.
    const headingTop = await dialog(page).getByRole("heading").evaluate((el) => el.getBoundingClientRect().top);
    notes.push(`${theme}: heading top=${Math.round(headingTop)}`);
    expect(headingTop).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `welcome-375-${theme}.png`) });
    await dialog(page).locator("section").screenshot({ path: path.join(OUT, `welcome-375-${theme}-full.png`) });

    if (theme === "light") {
      await page.getByRole("button", { name: "Начать" }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect.poll(() => seenAt(CLIENT.phone), { timeout: 15_000 }).not.toBe("NULL");
      notes.push(`after close: welcomeSeenAt=${seenAt(CLIENT.phone)}`);
      await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4_000);
      await expect(dialog(page)).toHaveCount(0);
    }
    await page.context().close();
  }
});

test("флаг в админке выключает окно, включённый — возвращает", async ({ browser }) => {
  const admin = await login(browser, "site-admin");
  // Окно приветствия у админа (если вдруг не видел) не мешает проверке.
  psql(`UPDATE "UserProfile" SET "welcomeSeenAt" = now() WHERE phone = '${ROLES.find((r) => r.key === "site-admin")!.phone}'`);
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  const row = admin.getByText("Приветствие этапа тестирования", { exact: true });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.scrollIntoViewIfNeeded();
  await admin.screenshot({ path: path.join(OUT, "admin-flag-on.png") });

  const off = await admin.request.patch(`${BASE}/api/admin/system-config`, {
    data: { welcomeDialogEnabled: false },
    headers: { origin: BASE },
  });
  const offBody = (await off.json()) as { data?: { welcomeDialogEnabled?: boolean } };
  notes.push(`PATCH off: ${off.status()} ${JSON.stringify(offBody.data)}`);
  expect(off.status()).toBe(200);
  expect(offBody.data?.welcomeDialogEnabled).toBe(false);

  clearOtpRateLimit(ROLES.map((r) => r.phone));
  resetWelcome(CLIENT.phone);
  const elena = await login(browser, "client");
  await elena.waitForTimeout(5_000);
  await expect(dialog(elena)).toHaveCount(0);
  notes.push("flag off: no dialog");

  const on = await admin.request.patch(`${BASE}/api/admin/system-config`, {
    data: { welcomeDialogEnabled: true },
    headers: { origin: BASE },
  });
  expect(on.status()).toBe(200);
  // Тот же вход: кэш /api/me сброшен, страница перечитывает личность.
  resetWelcome(CLIENT.phone);
  await elena.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
  await expect(dialog(elena)).toBeVisible({ timeout: 60_000 });
  notes.push("flag on again: dialog visible");
  await elena.context().close();
  await admin.context().close();
});
