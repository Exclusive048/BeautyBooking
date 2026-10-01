// 29.09 доработки · 31 — пределы чата, живьём (мастер `+7 999 100 00 00`).
//
// В dev-БД чатов нет (сид их не создаёт — чат заводит запись через воронку),
// поэтому фикстура заводится SQL-ом и удаляется в конце (и при падении):
//  - чат к записи `seed-bk-showcase-anna-07` (Алёна Михайлова, подтверждена,
//    в будущем — писать можно) со 130 сообщениями за последние 3 дня;
//  - чат к записи `seed-bk-showcase-anna-01` (Виктория Петрова) с двумя
//    сообщениями двухлетней давности — пара вне окна «за последний год».
//
// Проверяется:
//  1. подпись «Диалоги за последний год», в списке есть Алёна и нет Виктории;
//  2. в переписке 100 последних сообщений и кнопка «Показать раньше»;
//  3. «Показать раньше» → все 130, кнопка пропала, читатель остался на месте;
//  4. новое сообщение (отправка мастером) не выбрасывает загруженные ранние.
// Снимки: 1440 светлая и 390 тёмная. Каталог — SPEC31_OUT.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";

const OUT = process.env.SPEC31_OUT ?? ".qa/diagnostics/spec31";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const CHAT = "qa-s31-chat";
const OLD_CHAT = "qa-s31-old";
const TOTAL = 130;

let slugIdsBefore: string[] = [];
let startedAt = "";
let state: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

function cleanup(): void {
  psql(`delete from "ChatMessage" where "chatId" in ('${CHAT}', '${OLD_CHAT}')`);
  psql(`delete from "BookingChat" where id in ('${CHAT}', '${OLD_CHAT}')`);
  const keep = slugIdsBefore.map((id) => `'${id}'`).join(",") || "''";
  psql(`delete from "ConversationSlug" where id not in (${keep})`);
}

async function contextFor(browser: Browser, width: number, theme: "light" | "dark") {
  if (!state) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, ROLES.find((r) => r.key === "master")!, BASE);
    state = await ctx.storageState();
    await ctx.close();
  }
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    reducedMotion: "reduce",
    timezoneId: "Europe/Moscow",
    storageState: state,
  });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  return ctx;
}

test.describe.configure({ timeout: 600_000 });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
  startedAt = psql(`select now()::text`).trim();
  slugIdsBefore = psql(`select id from "ConversationSlug"`).split("\n").map((s) => s.trim()).filter(Boolean);
  cleanup();
  psql(
    `insert into "BookingChat" (id, "bookingId", "createdAt") values ` +
      `('${CHAT}', 'seed-bk-showcase-anna-07', now() - interval '3 days'), ` +
      `('${OLD_CHAT}', 'seed-bk-showcase-anna-01', now() - interval '2 years')`,
  );
  psql(
    `insert into "ChatMessage" (id, "chatId", "senderType", "senderName", body, "readAt", "createdAt") ` +
      `select 'qa-s31-m' || lpad(n::text, 4, '0'), '${CHAT}', ` +
      `case when n % 2 = 0 then 'MASTER'::"ChatSenderType" else 'CLIENT'::"ChatSenderType" end, 'QA', ` +
      `'QA-31 сообщение ' || n, now(), now() - interval '3 days' + (n * interval '30 minutes') ` +
      `from generate_series(1, ${TOTAL}) as n`,
  );
  psql(
    `insert into "ChatMessage" (id, "chatId", "senderType", "senderName", body, "readAt", "createdAt") values ` +
      `('qa-s31-old1', '${OLD_CHAT}', 'CLIENT', 'QA', 'QA-31 давнее 1', now(), now() - interval '2 years'), ` +
      `('qa-s31-old2', '${OLD_CHAT}', 'MASTER', 'QA', 'QA-31 давнее 2', now(), now() - interval '2 years' + interval '1 hour')`,
  );
});

test.afterAll(() => {
  // Отправка мастером заводит уведомление клиенту — убрать вместе с фикстурой.
  if (startedAt) psql(`delete from "Notification" where type = 'CHAT_MESSAGE_RECEIVED' and "createdAt" >= '${startedAt}'`);
  cleanup();
});

test("список за год, переписка по 100, «Показать раньше»", async ({ browser }) => {
  const ctx = await contextFor(browser, 1440, "light");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cabinet/master/messages`, { waitUntil: "domcontentloaded", timeout: 120_000 });

  // 1. Список: подпись окна, свежая пара есть, давней нет.
  await expect(page.getByText("Диалоги за последний год")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Алёна Михайлова").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Виктория Петрова")).toHaveCount(0);

  // 2. Переписка: 100 последних и кнопка.
  const thread = page.getByTestId("chat-thread");
  const bubbles = thread.getByText(/^QA-31 сообщение \d+$/);
  await expect(bubbles).toHaveCount(100, { timeout: 60_000 });
  await expect(thread.getByText("QA-31 сообщение 31", { exact: true })).toHaveCount(1);
  await expect(thread.getByText("QA-31 сообщение 30", { exact: true })).toHaveCount(0);
  const showEarlier = page.getByTestId("chat-thread-show-earlier");
  await expect(showEarlier).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "thread-1440-light.png") });

  // 3. «Показать раньше»: прокрутить к кнопке, нажать — первое из прежних
  // сообщений остаётся в видимой области.
  await showEarlier.scrollIntoViewIfNeeded();
  const anchor = thread.getByText("QA-31 сообщение 31", { exact: true });
  await showEarlier.click();
  await expect(bubbles).toHaveCount(TOTAL, { timeout: 30_000 });
  await expect(showEarlier).toHaveCount(0);
  await expect(anchor).toBeInViewport();
  await page.screenshot({ path: path.join(OUT, "thread-earlier-1440-light.png") });

  // 4. Новое сообщение не выбрасывает ранние.
  await page.getByRole("textbox", { name: "Текст сообщения" }).fill("QA-31 новое");
  await page.getByRole("button", { name: "Отправить" }).last().click();
  await expect(thread.getByText("QA-31 новое", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(bubbles).toHaveCount(TOTAL);
  await expect(thread.getByText("QA-31 сообщение 1", { exact: true })).toHaveCount(1);
  await ctx.close();

  // Телефон, тёмная тема: список и переписка.
  const mobile = await contextFor(browser, 390, "dark");
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/cabinet/master/messages`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(mpage.getByText("Диалоги за последний год")).toBeVisible({ timeout: 60_000 });
  await expect(mpage.getByText("Алёна Михайлова").first()).toBeVisible({ timeout: 60_000 });
  await mpage.screenshot({ path: path.join(OUT, "list-390-dark.png") });
  await mpage.getByText("Алёна Михайлова").first().click();
  await expect(mpage.getByTestId("chat-thread-show-earlier")).toBeVisible({ timeout: 60_000 });
  await mpage.getByTestId("chat-thread-show-earlier").scrollIntoViewIfNeeded();
  await mpage.screenshot({ path: path.join(OUT, "thread-390-dark.png") });
  await mobile.close();
});
