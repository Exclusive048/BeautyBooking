import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";
import { ROLES } from "./roles";

/**
 * BETA-PROMO-DEC — плашка «PREMIUM бесплатно до 31 декабря» (2026-10-29):
 * «Стать мастером» (гость), «Мои кабинеты» и окно приветствия (клиент без
 * кабинетов), обе темы, телефон и ПК.
 */

const OUT = process.env.BETA_PROMO_OUT ?? ".qa/diagnostics/beta-promo";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const THEMES = ["light", "dark"] as const;

async function withTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("theme", t), theme);
  await page.reload({ waitUntil: "domcontentloaded" });
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("«Стать мастером» — плашка под первым экраном", async ({ browser }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies([{ name: "mr_cookie_notice", value: "1.0:n", url: BASE }, { name: "mr-city-slug", value: "moscow", url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/become-master`, { waitUntil: "domcontentloaded" });
    for (const theme of THEMES) {
      await withTheme(page, theme);
      const banner = page.getByTestId("beta-promo-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("до 31 декабря");
      // Герой появляется анимацией после гидратации — снимать, когда он на месте.
      await page.waitForFunction(() => getComputedStyle(document.querySelector("h1")!).opacity === "1", null, { timeout: 30_000 });
      await banner.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `become-master-${viewport.width}-${theme}.png`) });
    }
    await ctx.close();
  }
});

test("«Мои кабинеты» и окно приветствия — клиент без кабинетов", async ({ browser }) => {
  test.setTimeout(120_000);
  const client = ROLES.find((r) => r.key === "client")!;
  clearOtpRateLimit([client.phone]);
  psql(`update "UserProfile" set "welcomeSeenAt" = null where phone = '${client.phone}'`);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginAs(page, client, BASE);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  const dialogBanner = dialog.getByTestId("beta-promo-banner");
  await expect(dialogBanner).toContainText("до 31 декабря");
  await expect(dialogBanner.getByRole("link")).toHaveCount(0);
  for (const theme of THEMES) {
    await page.evaluate((t) => {
      window.localStorage.setItem("theme", t);
      document.documentElement.classList.toggle("dark", t === "dark");
    }, theme);
    await dialogBanner.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `welcome-390-${theme}.png`) });
  }
  await dialog.getByRole("button", { name: "Начать" }).click();
  await expect(dialog).toBeHidden();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}/cabinet/roles`, { waitUntil: "domcontentloaded" });
    for (const theme of THEMES) {
      await withTheme(page, theme);
      const banner = page.getByTestId("beta-promo-banner");
      await expect(banner).toBeVisible();
      await expect(banner.getByRole("link", { name: "Подробнее о тарифах" })).toHaveAttribute("href", "/pricing");
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `roles-${viewport.width}-${theme}.png`) });
    }
  }
  await ctx.close();
});

test("«Мои кабинеты» у мастера и студии сразу — плашки нет", async ({ browser }) => {
  const studio = ROLES.find((r) => r.key === "studio-admin")!;
  const hasBoth = psql(
    `select count(*) from "UserProfile" u where u.phone = '${studio.phone}' and exists (select 1 from "MasterProfile" m where m."userId" = u.id)`,
  ).trim();
  test.skip(hasBoth !== "1", "у студии из сида нет кабинета мастера — сценарий «оба кабинета» не воспроизвести");
  clearOtpRateLimit([studio.phone]);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(page, studio, BASE);
  await page.goto(`${BASE}/cabinet/roles`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByTestId("beta-promo-banner")).toHaveCount(0);
  await ctx.close();
});
