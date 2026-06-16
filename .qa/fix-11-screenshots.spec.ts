// FIX-11 (QA-113) — schedule-grid card positioning proof.
//
// Captures the master schedule editor (/cabinet/master/schedule) and the
// studio calendar grid (/cabinet/studio/calendar) in both themes. Run this
// spec once with the server under TZ=UTC and once under TZ=Europe/Moscow:
// the grid card vertical offsets must match across both runs (the master
// grid is now positioned in the entity's own tz; the studio grid already
// used UTC deltas). Output dir is FIX11_OUT (default .qa/diagnostics/fix-11).
//
// Schedule pages hold an SSE notification stream — never wait on networkidle
// (it hangs). We use domcontentloaded + explicit element waits.

import { test, expect, type Page } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

const OUT = process.env.FIX11_OUT ?? ".qa/diagnostics/fix-11";

const master = ROLES.find((r) => r.key === "master")!;
const studioAdmin = ROLES.find((r) => r.key === "studio-admin")!;

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("theme", t), theme);
}

async function settleGrid(page: Page): Promise<void> {
  // Explicit grid waits instead of networkidle (SSE stream never idles).
  await page.waitForLoadState("domcontentloaded");
  // A hh:00 time-axis label is present in both grids once rendered.
  await expect(page.getByText(/\d{1,2}:00/).first()).toBeVisible({ timeout: 20_000 });
  // Brief settle for absolute-positioned cards to lay out.
  await page.waitForTimeout(700);
}

test.beforeAll(() => {
  clearOtpRateLimit(ROLES.map((r) => r.phone));
});

test("master schedule grid — both themes", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await loginAs(page, master, base);

  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${base}/cabinet/master/schedule`, { waitUntil: "domcontentloaded" });
    await setTheme(page, theme);
    await page.goto(`${base}/cabinet/master/schedule`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Расписание" }).first()).toBeVisible({
      timeout: 20_000,
    });
    await settleGrid(page);
    await page.screenshot({ path: `${OUT}/master-schedule-${theme}.png`, fullPage: true });
  }
});

test("studio calendar grid — both themes", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await loginAs(page, studioAdmin, base);

  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${base}/cabinet/studio/calendar`, { waitUntil: "domcontentloaded" });
    await setTheme(page, theme);
    await page.goto(`${base}/cabinet/studio/calendar`, { waitUntil: "domcontentloaded" });
    await settleGrid(page);
    await page.screenshot({ path: `${OUT}/studio-calendar-${theme}.png`, fullPage: true });
  }
});
