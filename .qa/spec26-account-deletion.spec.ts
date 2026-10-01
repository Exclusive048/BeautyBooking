// 29.09 доработки · 26 — удаление аккаунта клиента, живьём.
//
// Елена (`+7 999 500 00 00`, сид Vision): у неё предстоящие записи.
//  1. Удаление останавливается: «Сначала отмените предстоящие записи (N шт.)» и
//     ссылка «Мои записи» (решение 26.1) — 1280 светлая и 375 тёмная.
//  2. Её предстоящие записи снимаются в dev-БД (SQL — шаг подготовки, не
//     продукт), удаление проходит.
//  3. После удаления: профиль анонимизирован, уведомлений нет (решение 26.2),
//     а записи, отзывы, согласия — как были (политика KEEP до ответа юриста).
//
// ⚠️ Меняет dev-БД: после прогона — `npm run seed:test:reset` и `npm run seed:test`.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = process.env.SPEC26_OUT ?? ".qa/diagnostics/spec26";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const PHONE = "+79995000000";

function one(sql: string): string {
  return psql(sql).split("\n")[0] ?? "";
}

async function openDeleteModal(page: Page): Promise<void> {
  await page.goto(`${BASE}/cabinet/settings`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 60_000 });
  const open = page.getByRole("button", { name: "Удалить аккаунт", exact: true });
  await expect(async () => {
    await open.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").first().check();
  await dialog.locator('input[type="tel"]').fill(PHONE);
  await dialog.getByRole("button", { name: "Удалить мой аккаунт навсегда" }).click();
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test.describe.configure({ timeout: 600_000 });

test("удаление клиента: предстоящие записи останавливают, без них — удаляется", async ({ browser }) => {
  const client = ROLES.find((r) => r.key === "client")!;
  const userId = one(`select id from "UserProfile" where phone = '${PHONE}'`);
  expect(userId, "сид: Елена есть").not.toBe("");
  const upcoming = Number(
    one(
      `select count(*) from "Booking" where "clientUserId" = '${userId}' and "endAtUtc" > now() ` +
        `and status not in ('REJECTED','FINISHED','NO_SHOW')`,
    ),
  );
  expect(upcoming, "у Елены есть предстоящие записи").toBeGreaterThan(0);

  const login = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const loginPage = await login.newPage();
  await loginAs(loginPage, client, BASE);
  const state = await login.storageState();
  await login.close();

  // 1. Отказ с путём к записям — в обеих темах и обеих ширинах.
  for (const [width, theme] of [
    [1280, "light"],
    [375, "dark"],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, storageState: state });
    await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    const page = await ctx.newPage();
    await openDeleteModal(page);
    const alert = page.getByRole("dialog").getByRole("alert");
    await expect(alert).toContainText(`Сначала отмените предстоящие записи (${upcoming} шт.)`, { timeout: 30_000 });
    await expect(alert.getByRole("link", { name: "Мои записи" })).toHaveAttribute("href", "/cabinet/bookings");
    await page.screenshot({ path: path.join(OUT, `blocked-${width}-${theme}.png`) });
    await ctx.close();
  }
  expect(one(`select "isDeleted" from "UserProfile" where id = '${userId}'`)).toBe("f");

  // 2. Подготовка: предстоящие записи сняты (как если бы клиент их отменил).
  psql(
    `update "Booking" set status = 'REJECTED', "cancelledAtUtc" = now() where "clientUserId" = '${userId}' ` +
      `and "endAtUtc" > now() - interval '3 hours' and status not in ('REJECTED','FINISHED','NO_SHOW')`,
  );
  const before = {
    bookings: one(`select count(*) from "Booking" where "clientUserId" = '${userId}'`),
    named: one(`select count(*) from "Booking" where "clientUserId" = '${userId}' and "clientPhone" <> ''`),
    reviews: one(`select count(*) from "Review" where "authorId" = '${userId}'`),
    consents: one(`select count(*) from "UserConsent" where "userId" = '${userId}'`),
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: state });
  const page = await ctx.newPage();
  await openDeleteModal(page);
  await page.waitForURL(/\/\?deleted=1/, { timeout: 60_000 });
  await page.screenshot({ path: path.join(OUT, "deleted-1280.png") });
  await ctx.close();

  // 3. Итог в БД.
  expect(one(`select "isDeleted" from "UserProfile" where id = '${userId}'`)).toBe("t");
  expect(one(`select count(*) from "Notification" where "userId" = '${userId}'`), "уведомления — все").toBe("0");
  expect(one(`select count(*) from "OtpCode" where phone = '${PHONE}'`), "коды входа").toBe("0");
  expect({
    bookings: one(`select count(*) from "Booking" where "clientUserId" = '${userId}'`),
    named: one(`select count(*) from "Booking" where "clientUserId" = '${userId}' and "clientPhone" <> ''`),
    reviews: one(`select count(*) from "Review" where "authorId" = '${userId}'`),
    consents: one(`select count(*) from "UserConsent" where "userId" = '${userId}'`),
  }, "политика KEEP: записи, отзывы, согласия не тронуты").toEqual(before);
});
