// FIX-14 Surface 2 — booking (model-offer apply) still completes end-to-end
// from the public /models/<code> page after the internal-id strip.
//
// The apply flow is addressed purely by the offer's publicCode (URL) + the
// uploaded media; it never used the service/master/category ids that were
// removed. This proves it: login as client → open the offer → upload a photo
// → consent → submit → success status. Creates a ModelApplication row;
// restore the baseline after the run.

import path from "node:path";
import { test, expect } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";

const OUT = process.env.FIX14_OUT ?? ".qa/diagnostics/fix-14";
const OFFER_CODE = process.env.FIX14_OFFER_CODE ?? "seed-offer-anna-kravtsova-1-0";
const UPLOAD = path.resolve("public/portfolio-placeholders/anna-mn-01.png");
const client = ROLES.find((r) => r.key === "client")!;

test("model-offer apply completes from public page (publicCode, no internal id)", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  await loginAs(page, client, base);

  await page.goto(`${base}/models/${OFFER_CODE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // Master profile link uses /u/<username>, never a CUID.
  const profileLink = page.locator('a[href^="/u/"]').first();
  expect(await profileLink.count()).toBeGreaterThan(0);

  // Apply: upload photo → consent → submit. The apply POST targets
  // /api/model-offers/<code>/apply (publicCode-addressed).
  await page.locator('input[type="file"]').first().setInputFiles(UPLOAD);
  await page.locator('input[type="checkbox"]').first().check();

  const applyReq = page.waitForRequest(
    (r) => r.url().includes(`/api/model-offers/${OFFER_CODE}/apply`) && r.method() === "POST",
    { timeout: 20_000 },
  );
  const applyResp = page.waitForResponse(
    (r) => r.url().includes(`/api/model-offers/${OFFER_CODE}/apply`),
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Подать заявку" }).click();

  const req = await applyReq;
  const body = req.postDataJSON() as { consentToShoot?: boolean; mediaIds?: string[]; serviceId?: string; masterId?: string };
  expect(body.consentToShoot, "apply body consent").toBe(true);
  expect(Array.isArray(body.mediaIds) && body.mediaIds.length > 0, "apply body has mediaIds").toBeTruthy();
  expect(body.serviceId, "apply body needs NO serviceId").toBeUndefined();
  expect(body.masterId, "apply body needs NO masterId").toBeUndefined();

  const resp = await applyResp;
  expect([200, 201], "apply request succeeds (2xx)").toContain(resp.status());

  // Success view.
  await expect(page.getByText("Заявка отправлена!")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/surface2-apply-success.png`, fullPage: true });
});
