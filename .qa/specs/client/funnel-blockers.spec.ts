// QA-02 — Client funnel blockers, encoded as known-bug guards.
//
// Each test uses `test.fail()`: it is EXPECTED to fail while the bug exists, so
// the suite stays green today and turns red (alerting you to delete the guard)
// the moment the underlying defect is fixed. See QA-FINDINGS §4.
//
//   QA-101 🔴  slot/availability engine crashes the render worker → the public
//              slots API 500s (and so do /u/[username] + /u/[username]/booking).
//   QA-102 🔴  catalog route hard-crashes when a card with an unconfigured
//              next/image host (picsum.photos) renders — one bad image kills the
//              whole route instead of degrading per-card.
//   QA-103 🟠  /api/catalog/search (public) leaks internal CUID `id` (rule 12).
//   QA-104 🟠  home hero search builds /catalog?q=… but catalog reads
//              `serviceQuery` → the query is dropped end-to-end.

import { expect, test } from "@playwright/test";

const SERVICE_ID = "cmprgothr00nlvlakdeeky7bn"; // Галина "Стрижка мужская"

test.describe("client funnel blockers (known bugs — guards)", () => {
  test.fail(); // remove the matching guard once a bug below is fixed.

  test("QA-101: public slots API responds (currently 500 — worker crash)", async ({ request }) => {
    const res = await request.get(
      `/api/public/providers/galina-stepanova-26/slots?serviceId=${SERVICE_ID}&from=2026-07-06`,
    );
    expect(res.status()).toBe(200);
  });

  test("QA-102: catalog renders results without crashing", async ({ page }) => {
    await page.goto("/catalog");
    // Error boundary copy that appears when the route throws.
    await expect(page.getByText("Не получилось. Попробуйте ещё раз.")).toBeHidden({ timeout: 8000 });
  });

  test("QA-103: catalog search response carries no internal id (rule 12)", async ({ request }) => {
    const res = await request.get("/api/catalog/search?limit=20&page=1", {
      headers: { Cookie: "mr-city-slug=moscow" },
    });
    const json = await res.json();
    const leaks = (json.data.items as Array<{ id?: string }>).some((i) => /^cmp[a-z0-9]+$/.test(i.id ?? ""));
    expect(leaks).toBe(false);
  });

  test("QA-104: home hero `q` is honoured by the catalog API", async ({ page }) => {
    const search = page.waitForRequest(
      (r) => r.url().includes("/api/catalog/search") && r.url().includes("serviceQuery="),
    );
    await page.goto("/catalog?q=%D1%81%D1%82%D1%80%D0%B8%D0%B6%D0%BA%D0%B0"); // q=стрижка
    await search; // fails (times out) — catalog never forwards `q` as serviceQuery
  });
});
