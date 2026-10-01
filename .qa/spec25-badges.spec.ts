// 29.09 доработки · 25 (UI-22) — плашки `Badge size="xs"` и `CountBadge`.
//
// Снимки экранов, где плашки появились вместо самодельных `<span>`, в обеих
// темах — их смотрят глазами (спека 25, «Проверка»: где появляется `Badge` —
// смотреть глазами). Плюс проверка, что плашка на экране действительно есть:
// иначе снимок «без плашек» прошёл бы молча.
//
// Запуск: SPEC25_BADGES_OUT (по умолчанию .qa/diagnostics/spec25/badges).

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ROLES, type Role } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const OUT = process.env.SPEC25_BADGES_OUT ?? ".qa/diagnostics/spec25/badges";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
/** Классы `Badge size="xs"` (components/ui/badge.tsx) — по ним плашку и ищем. */
const BADGE_XS = "span.rounded-full.border.font-mono.uppercase.text-3xs";
/** `CountBadge` (components/ui/count-badge.tsx). */
const COUNT_BADGE = "span.min-w-4.h-4.rounded-full.bg-primary.text-3xs";

const states = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function contextFor(browser: Browser, width: number, theme: "light" | "dark", role: Role): Promise<BrowserContext> {
  if (!states.has(role.key)) {
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
    storageState: states.get(role.key),
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
}

type Shot = {
  key: string;
  url: string;
  role: Role["key"];
  width: number;
  /** Что обязано быть на экране. */
  expect: string;
  /** Действие после загрузки (открыть вкладку). */
  then?: (page: Page) => Promise<void>;
};

/** Счётчики кабинетов мастера и студии — в шторке «Ещё» нижней навигации. */
async function openMore(page: Page): Promise<void> {
  const more = page.getByRole("button", { name: /^Ещё/ }).last();
  await expect(async () => {
    await more.click();
    await expect(page.getByRole("dialog").last()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

const SHOTS: Shot[] = [
  { key: "studio-team", url: "/cabinet/studio/settings?section=owner-team", role: "studio-admin", width: 1280, expect: BADGE_XS },
  { key: "studio-notify", url: "/cabinet/studio/settings?section=notifications", role: "studio-admin", width: 1280, expect: BADGE_XS },
  { key: "studio-clients", url: "/cabinet/studio/clients", role: "studio-admin", width: 1280, expect: BADGE_XS },
  { key: "studio-bookings", url: "/cabinet/studio/bookings", role: "studio-admin", width: 1280, expect: BADGE_XS },
  {
    key: "admin-subscriptions",
    url: "/admin/billing",
    role: "site-admin",
    width: 1280,
    expect: BADGE_XS,
    then: async (page) => {
      // Клик до гидратации теряется — повторять, пока вкладка не выбрана.
      const tab = page.getByRole("tab", { name: /подписки/i }).first();
      await expect(async () => {
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
    },
  },
  { key: "master-reviews", url: "/cabinet/master/reviews", role: "master", width: 1280, expect: BADGE_XS },
  { key: "client-nav-375", url: "/cabinet/bookings", role: "client", width: 375, expect: '[data-testid="bottom-tab-indicator"]' },
  { key: "master-nav-375", url: "/cabinet/master/dashboard", role: "master", width: 375, expect: COUNT_BADGE, then: openMore },
  { key: "studio-nav-375", url: "/cabinet/studio", role: "studio-admin", width: 375, expect: COUNT_BADGE, then: openMore },
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test.describe.configure({ timeout: 900_000 });

test("плашки Badge xs и счётчики CountBadge — снимки в обеих темах", async ({ browser }) => {
  for (const theme of ["light", "dark"] as const) {
    for (const shot of SHOTS) {
      // Повторный прогон досняет только недостающее.
      if (existsSync(path.join(OUT, `${shot.key}-${theme}.png`))) continue;
      const role = ROLES.find((r) => r.key === shot.role)!;
      const ctx = await contextFor(browser, shot.width, theme, role);
      const page = await ctx.newPage();
      await open(page, shot.url);
      if (shot.then) await shot.then(page);
      await expect
        .soft(page.locator(shot.expect).first(), `${shot.key}@${theme}: на экране есть ${shot.expect}`)
        .toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1_500);
      // Нижняя навигация и шторка «Ещё» закреплены у нижней кромки экрана —
      // на снимке всей страницы их не видно, снимается экран.
      await page.screenshot({ path: path.join(OUT, `${shot.key}-${theme}.png`), fullPage: shot.width > 375 });
      await ctx.close();
    }
  }
});
