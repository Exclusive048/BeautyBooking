// DEV-SCENARIO-01 fixes — живая проверка восьми правок и плитки «Свободно сегодня».
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { ROLES, type RoleKey } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = ".qa/diagnostics/dev-scenario-fixes";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const notes: string[] = [];

async function login(browser: Browser, key: RoleKey): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "ru-RU" });
  const page = await ctx.newPage();
  await loginAs(page, ROLES.find((r) => r.key === key)!, BASE, { channel: "phone" });
  return page;
}

async function settle(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, { timeout: 90_000 })
    .catch(() => {});
}

async function go(page: Page, url: string): Promise<void> {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await settle(page);
}

test.describe.configure({ timeout: 560_000 });
test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});
test.afterAll(() => writeFileSync(path.join(OUT, "notes.txt"), notes.join("\n")));

test("весь сценарий", async ({ browser }) => {
  // --- мастер: меню, канбан, плитка ---
  const anna = await login(browser, "master");
  await go(anna, "/cabinet/master/schedule/settings");
  const active = anna.locator('nav[aria-label="Разделы кабинета"] [aria-current="page"]');
  notes.push(`sidebar active on settings: ${await active.count()} → ${(await active.allInnerTexts()).join(" | ")}`);
  expect(await active.count()).toBe(1);

  await go(anna, "/cabinet/master/bookings");
  await expect(anna.getByText("Без ответа за 24 ч запись отменится")).toBeVisible({ timeout: 60_000 });

  await go(anna, "/cabinet/master/schedule?view=week");
  const tile = anna.getByText("Свободно сегодня").locator("xpath=ancestor::*[self::div][2]");
  notes.push(`free-today tile: ${(await tile.innerText()).replace(/\s+/g, " ")}`);
  await anna.screenshot({ path: path.join(OUT, "anna-schedule.png") });

  // --- клиент: шапка без отзывов, запятая в рейтинге ---
  const elena = await login(browser, "client");
  await go(elena, "/u/anna-kravtsova-1");
  await expect(elena.getByText("Пока без отзывов")).toBeVisible({ timeout: 60_000 });
  await go(elena, "/u/anna-sokolova");
  const heroRating = await elena.getByTestId("page-main").or(elena.locator("main")).first().locator("strong").first().innerText();
  notes.push(`anna hero rating: ${heroRating}`);
  expect(heroRating).toMatch(/^\d,\d$/);

  // --- запись: телефон, экран успеха ---
  await elena.getByRole("button", { name: "Добавить" }).first().click();
  await expect(
    elena.getByRole("button", { name: /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс) \d+$/, disabled: false }).first(),
  ).toBeVisible({ timeout: 60_000 });
  let picked = false;
  for (let i = 0; i < 7 && !picked; i += 1) {
    const days = elena.getByRole("button", { name: /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс) \d+$/, disabled: false });
    const count = await days.count();
    if (i >= count) break;
    await days.nth(i).click();
    await elena.waitForTimeout(1500);
    const slot = elena.getByRole("button", { name: /^\d{2}:\d{2}$/ }).last();
    if (await slot.isVisible().catch(() => false)) {
      await slot.click();
      picked = true;
    }
  }
  if (!picked) {
    writeFileSync(path.join(OUT, "widget.aria.txt"), await elena.locator("body").ariaSnapshot());
    await elena.screenshot({ path: path.join(OUT, "widget.png"), fullPage: true });
  }
  expect(picked).toBe(true);
  await elena.getByRole("button", { name: "Продолжить" }).click();
  await expect(elena.getByText("Запись на номер")).toBeVisible({ timeout: 30_000 });
  const phoneChip = await elena.getByText("Запись на номер").locator("..").innerText();
  notes.push(`form phone: ${phoneChip}`);
  expect(phoneChip).toContain("+7 (999) 500-00-00");
  await elena.getByTestId("booking-submit").click();
  await expect(elena.getByText("Запись отправлена")).toBeVisible({ timeout: 30_000 });
  await expect(elena.getByText("Записали на номер")).toBeVisible();
  await expect(elena.getByText(/подтвердит запись/)).toBeVisible();
  await expect(elena.getByText(/ждёт вас/)).toHaveCount(0);
  await elena.screenshot({ path: path.join(OUT, "elena-success-pending.png") });
  const bookingId = new URL(elena.url()).searchParams.get("bookingId")!;
  notes.push(`booking: ${bookingId} status=${psql(`select status from "Booking" where id='${bookingId}'`).trim()}`);

  // --- мастер: уведомление без «записался» по имени, подтверждение, отмена с причиной ---
  const body = psql(
    `select body from "Notification" where "bookingId"='${bookingId}' and type='BOOKING_CREATED' order by "createdAt" desc limit 1`,
  ).trim();
  notes.push(`new-booking notification: ${body}`);
  expect(body.startsWith("Клиент Елена Петрова записался")).toBe(true);

  await go(anna, "/cabinet/master/bookings");
  const card = anna.getByTestId("page-main").locator("article", { hasText: "Елена Петрова" }).filter({
    has: anna.getByRole("button", { name: "Подтвердить", exact: true }),
  });
  await card.first().getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect
    .poll(() => psql(`select status from "Booking" where id='${bookingId}'`).trim(), { timeout: 30_000 })
    .toBe("CONFIRMED");
  await go(anna, "/cabinet/master/bookings");
  const confirmedCard = anna
    .getByTestId("page-main")
    .locator("article", { hasText: "Елена Петрова" })
    .filter({ has: anna.getByRole("button", { name: "Отменить", exact: true }) });
  await confirmedCard.first().getByRole("button", { name: "Отменить", exact: true }).click();
  const dialog = anna.getByRole("dialog");
  await dialog.getByRole("textbox").pressSequentially("Заболела, переношу на следующую неделю", { delay: 10 });
  await dialog.getByRole("button", { name: "Отменить запись" }).click();
  await expect
    .poll(() => psql(`select "cancelReason" from "Booking" where id='${bookingId}'`).trim(), { timeout: 30_000 })
    .toBe("Заболела, переношу на следующую неделю");
  const cancelBody = psql(
    `select body from "Notification" where "bookingId"='${bookingId}' and type='BOOKING_CANCELLED_BY_MASTER' order by "createdAt" desc limit 1`,
  ).trim();
  notes.push(`cancel notification: ${cancelBody}`);
  expect(cancelBody).toContain("Причина: Заболела, переношу на следующую неделю");

  // --- клиент видит причину в «Моих записях» ---
  await go(elena, "/cabinet/bookings");
  const row = elena.locator(`[data-focus-id="${bookingId}"]`).or(
    elena.getByTestId("booking-row").filter({ hasText: "Причина отмены:" }),
  );
  await expect(row.first().getByText("Причина отмены:")).toBeVisible({ timeout: 60_000 });
  await row.first().scrollIntoViewIfNeeded();
  await elena.screenshot({ path: path.join(OUT, "elena-bookings-reason.png") });

  await anna.context().close();
  await elena.context().close();
});
