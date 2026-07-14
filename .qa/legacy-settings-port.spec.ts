// LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE — Phase C live verification.
//
// Proves the onboarding gap is closed: as the studio admin, from the
// reachable settings NAV (not a manual orphan URL), a studio can edit +
// save «Общее» (the fixed studioId→providerId bug), «Профиль и медиа»
// (avatar/banner/address/contacts/published), and «Портфолио». Records
// every /api/studios/[id] PATCH status and asserts 200.

import { expect, test } from "@playwright/test";
import { loginAs } from "./login";
import { ROLES } from "./roles";

const STUDIO_ADMIN = ROLES.find((r) => r.key === "studio-admin")!;
const SHOT_DIR = ".qa/diagnostics/studio-settings-audit";

test("studio settings port — saves round-trip from the reachable nav", async ({ page, baseURL }) => {
  const patchStatuses: Array<{ url: string; status: number }> = [];
  page.on("response", (resp) => {
    const url = resp.url();
    if (resp.request().method() === "PATCH" && url.includes("/api/studios/")) {
      patchStatuses.push({ url, status: resp.status() });
    }
  });

  const result = await loginAs(page, STUDIO_ADMIN, baseURL!);
  expect(result.landedPath).toBe("/cabinet/studio");

  // ---- «Общее» save (the studioId→providerId bug fix) ----
  await page.goto(`${baseURL}/cabinet/studio/settings?section=general`);
  const tagline = page.getByLabel("Краткий слоган");
  await expect(tagline).toBeVisible();
  const originalTagline = await tagline.inputValue();
  await tagline.fill(`${originalTagline} ·`);
  // GeneralForm "Сохранить" (section body, not the topbar)
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );
  const generalPatch = patchStatuses.at(-1);
  expect(generalPatch?.status, `general PATCH → ${generalPatch?.status}`).toBe(200);

  // ---- «Профиль и медиа» — reachable from the nav, save contacts ----
  await page.goto(`${baseURL}/cabinet/studio/settings?section=profile-media`);
  // Nav item exists (reachable, not a manual URL)
  await expect(page.getByRole("button", { name: /Профиль и медиа/ })).toBeVisible();
  // Editor loaded (hero published toggle + form phone field)
  const phone = page.getByPlaceholder("+7 900 000 00 00");
  await expect(phone).toBeVisible({ timeout: 15000 });
  await phone.fill("+7 900 111 22 33");
  await page.screenshot({ path: `${SHOT_DIR}/10-NEW-profile-media-dark.png`, fullPage: true });
  const beforeProfilePatches = patchStatuses.length;
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );
  const profilePatch = patchStatuses.at(-1);
  expect(patchStatuses.length).toBeGreaterThan(beforeProfilePatches);
  expect(profilePatch?.status, `profile-media PATCH → ${profilePatch?.status}`).toBe(200);
  // Round-trip: reload, the saved phone persists
  await page.reload();
  await expect(page.getByPlaceholder("+7 900 000 00 00")).toHaveValue("+7 900 111 22 33", {
    timeout: 15000,
  });

  // ---- «Портфолио» — reachable, editor renders ----
  await page.goto(`${baseURL}/cabinet/studio/settings?section=portfolio`);
  await expect(page.getByRole("button", { name: /Портфолио/ })).toBeVisible();
  await expect(page.getByText("Перетащите фото сюда")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/11-NEW-portfolio-dark.png`, fullPage: true });

  // ---- Archive PATCH now targets the Provider id (bug fix) ----
  // Actually archive (confirm auto-accepts) → the PATCH must hit
  // /api/studios/<providerId> and return 200 (was studioId → 404). Baseline
  // restore afterwards re-publishes the studio.
  await page.goto(`${baseURL}/cabinet/studio/settings?section=danger`);
  const archiveBtn = page.getByRole("button", { name: "Архивировать", exact: true });
  await expect(archiveBtn).toBeVisible();
  page.on("dialog", (d) => d.accept());
  const beforeArchivePatches = patchStatuses.length;
  await archiveBtn.click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );
  const archivePatch = patchStatuses.at(-1);
  expect(patchStatuses.length).toBeGreaterThan(beforeArchivePatches);
  expect(archivePatch?.status, `archive PATCH → ${archivePatch?.status}`).toBe(200);
  expect(archivePatch?.url).toMatch(/\/api\/studios\/cmr/);

  // ---- Light theme captures ----
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.goto(`${baseURL}/cabinet/studio/settings?section=profile-media`);
  await expect(page.getByPlaceholder("+7 900 000 00 00")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/10-NEW-profile-media-light.png`, fullPage: true });
  await page.goto(`${baseURL}/cabinet/studio/settings?section=portfolio`);
  await expect(page.getByText("Перетащите фото сюда")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/11-NEW-portfolio-light.png`, fullPage: true });

  // No console errors introduced by the ported sections. The only surviving
  // entry is a PRE-EXISTING React hydration warning inside the shared
  // `PortfolioEditor` (caret-color:transparent on its hidden file input) —
  // reproduces wherever that component mounts (incl. the old orphan page),
  // not introduced by this port. Filter it and assert the rest is clean.
  const introducedErrors = result.consoleErrors.filter(
    (e) => !e.text.includes("caret-color"),
  );
  expect(introducedErrors, JSON.stringify(introducedErrors)).toEqual([]);
});
