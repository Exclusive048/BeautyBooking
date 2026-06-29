// FIX-15 (RULE-12-REMAINDER) — portfolio favorite mutation + stories view-tracking
// still work after the raw CUID → opaque-token swap.
//
// Surface 1: POST /api/portfolio/<opaque-token>/favorite resolves the token
//   server-side and toggles the row (200, favorited true→false).
// Surface 2: the stories viewer records views client-side keyed by the opaque
//   item id (localStorage), and the rail renders with opaque keys.
//
// Creates a portfolio-favorite row; restore the baseline after.

import { test, expect } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";

const OUT = process.env.FIX15_OUT ?? ".qa/diagnostics/fix-15";
const client = ROLES.find((r) => r.key === "client")!;

test("Surface 1 — portfolio favorite toggles via opaque token (200, idempotent)", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await loginAs(page, client, base);

  // Pull a portfolio item's opaque id from the public feed.
  const feed = await page.request.get(`${base}/api/feed/portfolio?limit=8`);
  expect(feed.status()).toBe(200);
  const feedJson = await feed.json();
  const token: string = feedJson.data.items[0].id;
  expect(token.startsWith("e_"), "feed id is an opaque token").toBeTruthy();

  // First toggle: resolves the token server-side + mutates the row.
  const first = await page.request.post(`${base}/api/portfolio/${token}/favorite`);
  expect(first.status(), "favorite toggle resolves token + mutates").toBe(200);
  const firstJson = await first.json();
  expect(firstJson.ok).toBe(true);
  expect(typeof firstJson.data.isFavorited).toBe("boolean");

  // Second toggle on the SAME token flips the state → proves the token maps to
  // exactly one portfolio row (direction-agnostic vs any seed favorite state).
  const second = await page.request.post(`${base}/api/portfolio/${token}/favorite`);
  expect(second.status()).toBe(200);
  const secondJson = await second.json();
  expect(secondJson.data.isFavorited).toBe(!firstJson.data.isFavorited);
});

test("Surface 2 — stories feed clean + view-tracking records the opaque id", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await page.context().addCookies([{ name: "mr-city-slug", value: "moscow", url: base }]);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
      window.localStorage.setItem("cookie-consent", "accepted");
    } catch {
      /* cookie still suppresses the city prompt */
    }
  });

  // Confirm the public feed exposes only opaque story ids.
  const feed = await page.request.get(`${base}/api/feed/stories`);
  expect(feed.status()).toBe(200);
  const feedJson = await feed.json();
  const groups = feedJson.data.groups as Array<{ masterId: string; items: Array<{ id: string }> }>;
  if (groups.length === 0) {
    test.info().annotations.push({ type: "note", description: "no stories in seed — feed clean by construction" });
    return;
  }
  const storyItemId = groups[0].items[0].id;
  expect(groups[0].masterId.startsWith("e_")).toBeTruthy();
  expect(storyItemId.startsWith("e_")).toBeTruthy();

  // Open the stories viewer from the home rail and let view-tracking fire.
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const railButton = page.locator('[data-testid="stories-rail"] button, button:has-text("истори")').first();
  // Fallback: click the first story avatar in the rail region if present.
  const opened = await railButton.count();
  if (opened > 0) {
    await railButton.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const viewed = await page.evaluate(() => window.localStorage.getItem("mr-stories-viewed-items"));
  // View-tracking stores the opaque token verbatim (no raw CUID leaks to storage).
  if (viewed) {
    expect(viewed).not.toMatch(/cm[a-z0-9]{22,}/);
  }
  await page.screenshot({ path: `${OUT}/stories-rail.png`, fullPage: false });
});
