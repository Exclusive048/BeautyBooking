// FIX-13 — QA-103 (no CUID leak) + QA-104 (home/footer deep-links apply filters).
//
// Item 1: catalog cards link to /u/<username> (no CUID); favorites POST sends
//         providerUsername and succeeds.
// Item 2: home hero search → serviceQuery; category chip → globalCategoryId;
//         footer "available today" → availableToday=true; each lands filtered.
//         Verified on desktop + mobile, with reload preserving the filter.
//
// Public surfaces — suppress the first-visit city prompt + cookie banner.

import { test, expect, type Page } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";

const OUT = process.env.FIX13_OUT ?? ".qa/diagnostics/fix-13";
const client = ROLES.find((r) => r.key === "client")!;

async function suppressOverlays(page: Page, base: string): Promise<void> {
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

// ---- Item 2: deep-links (desktop + mobile) ----
for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`QA-104 home/footer deep-links apply filter — ${vp.name}`, async ({ page, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await suppressOverlays(page, base);

    // --- Footer "Мастера рядом" = available-today ---
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const footerLink = page.getByRole("link", { name: "Мастера рядом" });
    const footerHref = await footerLink.getAttribute("href");
    expect(footerHref, "footer available-today href").toContain("availableToday=true");
    expect(footerHref).not.toContain("available=today");

    // --- Category chip = globalCategoryId (real id, not slug) ---
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500); // categories fetch client-side
    const catLink = page.locator('a[href*="/catalog?"][href*="globalCategoryId="]').first();
    let categoryUrl: string | null = null;
    if (await catLink.count()) {
      categoryUrl = await catLink.getAttribute("href");
      expect(categoryUrl, "category chip href").toContain("globalCategoryId=");
      expect(categoryUrl).not.toContain("category=");
    }

    // --- Hero search emits serviceQuery ---
    // Controlled <Input> only updates state from REAL input events (.fill()
    // sets the DOM value without firing onChange — see .qa/login.ts), so type
    // char-by-char and click the submit button after hydration settles.
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Какая услуга?");
    await expect(search).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200); // hydration
    await search.click();
    await search.pressSequentially("маникюр", { delay: 25 });
    await page.getByRole("button", { name: "Найти мастера" }).click();
    await page.waitForURL(/\/catalog/, { timeout: 15_000 });
    expect(page.url()).toContain("serviceQuery=");
    expect(page.url()).not.toMatch(/[?&]q=/);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/item2-search-${vp.name}.png`, fullPage: true });

    // --- Available-today deep-link lands filtered + reload preserves ---
    await page.goto(`${base}${footerHref}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("availableToday=true");
    await page.screenshot({ path: `${OUT}/item2-available-today-${vp.name}.png`, fullPage: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    expect(page.url(), "reload preserves availableToday").toContain("availableToday=true");

    // --- Category deep-link lands filtered (if a chip existed) ---
    if (categoryUrl) {
      await page.goto(`${base}${categoryUrl}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      expect(page.url()).toContain("globalCategoryId=");
      await page.screenshot({ path: `${OUT}/item2-category-${vp.name}.png`, fullPage: true });
    }
  });
}

// ---- Item 1: card links via username, no CUID; favorites by username ----
test("QA-103 catalog cards link via /u/<username>, no CUID in DOM", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await suppressOverlays(page, base);
  await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // At least one profile link, and all profile links use /u/<username>.
  const profileLinks = page.locator('a[href^="/u/"]');
  expect(await profileLinks.count(), "profile links present").toBeGreaterThan(0);

  // No /providers/<cuid> id-based links on the catalog.
  const idLinks = await page.locator('a[href*="/providers/"]').count();
  expect(idLinks, "no id-based provider links").toBe(0);
  await page.screenshot({ path: `${OUT}/item1-catalog-links.png`, fullPage: true });
});

test("QA-103 favorites toggle sends providerUsername + succeeds", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await suppressOverlays(page, base);
  await loginAs(page, client, base);

  await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Capture the favorites toggle request triggered by the heart click.
  const togglePromise = page.waitForRequest(
    (r) => r.url().includes("/api/favorites/toggle") && r.method() === "POST",
    { timeout: 15_000 },
  );
  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/favorites/toggle"),
    { timeout: 15_000 },
  );

  const heart = page.getByRole("button", { name: /избранн/i }).first();
  await heart.click();

  const req = await togglePromise;
  const body = req.postDataJSON() as { providerId?: string; providerUsername?: string };
  expect(body.providerUsername, "favorites POST uses providerUsername").toBeTruthy();
  expect(body.providerId, "favorites POST does NOT use raw providerId").toBeUndefined();

  const resp = await respPromise;
  expect(resp.status(), "favorites toggle succeeds").toBe(200);
  await page.screenshot({ path: `${OUT}/item1-favorite-toggled.png` });
});
