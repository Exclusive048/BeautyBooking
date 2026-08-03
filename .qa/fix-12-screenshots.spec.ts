// FIX-12 (QA-102-L1) — focal/portfolio image per-card resilience.
//
// With one seed master's avatar + portfolio URLs pointed at a bad image host
// (unconfigured remote host OR a dead/404 URL), the catalog route must stay
// 200 with that one card showing the local placeholder while every other card
// renders, and the public profile must render fine. No next/image "Invalid
// src" throw, no route-wide break. Output dir = FIX12_OUT.
//
// Public surfaces — no login needed. We suppress the first-visit city-prompt
// + cookie banner the same way .qa/login.ts does, then screenshot both themes.

import { test, expect, type Page } from "@playwright/test";

const OUT = process.env.FIX12_OUT ?? ".qa/diagnostics/fix-12";
const PROFILE = "anna-sokolova";

async function prep(page: Page, base: string, errors: string[]): Promise<void> {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.context().addCookies([
    { name: "mr-city-slug", value: "moscow", url: base },
    { name: "mr_cookie_notice", value: "1.0:n", url: base },
  ]);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
    } catch {
      /* cookie still suppresses the city prompt */
    }
  });
}

async function shoot(page: Page, theme: "light" | "dark", url: string, name: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => window.localStorage.setItem("theme", t), theme);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500); // let client cards / images settle
  await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
}

test("catalog stays 200 + placeholder card, no image throw", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  const errors: string[] = [];
  await prep(page, base, errors);

  const resp = await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
  expect(resp?.status()).toBe(200);
  await page.waitForTimeout(2000);

  for (const theme of ["light", "dark"] as const) {
    await shoot(page, theme, `${base}/catalog`, "catalog");
  }

  // No next/image host-validation throw reached the console.
  const imageThrows = errors.filter(
    (e) => /Invalid src prop|hostname .* is not configured/i.test(e),
  );
  expect(imageThrows, `unexpected next/image throws:\n${imageThrows.join("\n")}`).toHaveLength(0);
});

test("public profile renders with placeholders", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  const errors: string[] = [];
  await prep(page, base, errors);

  const resp = await page.goto(`${base}/u/${PROFILE}`, { waitUntil: "domcontentloaded" });
  expect(resp?.status()).toBe(200);

  for (const theme of ["light", "dark"] as const) {
    await shoot(page, theme, `${base}/u/${PROFILE}`, "profile");
  }

  const imageThrows = errors.filter(
    (e) => /Invalid src prop|hostname .* is not configured/i.test(e),
  );
  expect(imageThrows, `unexpected next/image throws:\n${imageThrows.join("\n")}`).toHaveLength(0);
});
