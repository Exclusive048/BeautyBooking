// LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE — Phase C live verification.
//
// Proves the onboarding gap is closed: as the studio admin, from the
// reachable settings NAV (not a manual orphan URL), a studio can edit +
// save its profile (name/tagline/avatar/banner/address/contacts/published),
// «Портфолио» and «Правила студии». Records every /api/studios/[id] PATCH
// status and asserts 200.
//
// FIX-STUDIO-SETTINGS-MERGE (2026-09-13) — переписан под новую раскладку:
//   · «Общее» удалено, слоган переехал в «Профиль» (один PATCH на всю форму);
//   · «Профиль и медиа» переименован в «Профиль»;
//   · «Архивировать студию» удалено из необратимых действий (дубль тумблера
//     «Опубликован»), поэтому шаг архивации заменён проверкой того, что в
//     разделе остался ровно один сценарий — безвозвратное удаление;
//   · «Правила студии» стали редактируемыми — добавлен их round-trip, ради
//     которого правка и делалась (без мастеров правила были недостижимы).
// Легаси-URL `?section=general` и `?section=profile-media` обязаны резолвиться
// в «Профиль» — они живут в закладках, и это отдельная проверка.

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

  // ---- Легаси-URL резолвятся в «Профиль», а не в 404/пустой экран ----
  for (const legacy of ["general", "profile-media"]) {
    await page.goto(`${baseURL}/cabinet/studio/settings?section=${legacy}`);
    await expect(page.getByRole("button", { name: "Профиль", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  // Удалённой вкладки в навигации быть не должно.
  await expect(page.getByRole("button", { name: "Общее", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Профиль и медиа/ })).toHaveCount(0);

  // ---- «Профиль» — слоган + контакты сохраняются ОДНИМ PATCH ----
  await page.goto(`${baseURL}/cabinet/studio/settings`);
  await expect(page.getByRole("button", { name: "Профиль", exact: true })).toBeVisible();

  const phone = page.getByPlaceholder("+7 900 000 00 00");
  await expect(phone).toBeVisible({ timeout: 15000 });

  // Слоган переехал сюда из удалённой вкладки «Общее».
  const tagline = page.getByPlaceholder("Одной строкой — чем вы хороши");
  await expect(tagline).toBeVisible();
  const originalTagline = await tagline.inputValue();
  await tagline.fill(`${originalTagline} ·`);
  await phone.fill("+7 900 111 22 33");

  // FIX-STUDIO-FORM-BORDERS: у полей должна быть ВИДИМАЯ рамка в обеих темах.
  // Проверяется свойство (ненулевая ширина + непрозрачный цвет), а не класс:
  // прежний дефект был именно «класс есть, рамки нет» (border-white/10 в
  // светлой теме — контраст ~1:1). Прозрачность ловится по alpha в rgba().
  const border = await phone.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.borderTopWidth, color: style.borderTopColor };
  });
  expect(Number.parseFloat(border.width)).toBeGreaterThan(0);
  expect(border.color).not.toMatch(/rgba\([^)]*,\s*0(\.\d+)?\)$/);

  await page.screenshot({ path: `${SHOT_DIR}/10-NEW-profile-dark.png`, fullPage: true });
  const beforeProfilePatches = patchStatuses.length;
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );
  const profilePatch = patchStatuses.at(-1);
  expect(patchStatuses.length).toBeGreaterThan(beforeProfilePatches);
  expect(profilePatch?.status, `profile PATCH → ${profilePatch?.status}`).toBe(200);
  // PATCH идёт на providerId, а не на studioId (прежний баг → 404).
  expect(profilePatch?.url).toMatch(/\/api\/studios\/cmr/);

  // Round-trip: reload, оба поля сохранились
  await page.reload();
  await expect(page.getByPlaceholder("+7 900 000 00 00")).toHaveValue("+7 900 111 22 33", {
    timeout: 15000,
  });
  await expect(page.getByPlaceholder("Одной строкой — чем вы хороши")).toHaveValue(
    `${originalTagline} ·`,
  );

  // ---- «Правила студии» — редактируемые БЕЗ мастеров (FIX-STUDIO-POLICY-EDITABLE) ----
  await page.goto(`${baseURL}/cabinet/studio/settings?section=policy`);
  const minAhead = page.getByLabel("Минимум за");
  await expect(minAhead).toBeVisible({ timeout: 15000 });
  const originalMin = await minAhead.inputValue();
  const nextMin = originalMin === "3" ? "4" : "3";
  await minAhead.fill(nextMin);
  const beforePolicyPatches = patchStatuses.length;
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );
  const policyPatch = patchStatuses.at(-1);
  expect(patchStatuses.length).toBeGreaterThan(beforePolicyPatches);
  expect(policyPatch?.status, `policy PATCH → ${policyPatch?.status}`).toBe(200);
  await page.reload();
  await expect(page.getByLabel("Минимум за")).toHaveValue(nextMin, { timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/12-NEW-policy-dark.png`, fullPage: true });
  // Восстанавливаем базовое значение, чтобы спека была идемпотентной.
  await page.getByLabel("Минимум за").fill(originalMin);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/studios/"),
  );

  // ---- «Портфолио» — reachable, editor renders ----
  await page.goto(`${baseURL}/cabinet/studio/settings?section=portfolio`);
  await expect(page.getByRole("button", { name: /Портфолио/ })).toBeVisible();
  await expect(page.getByText("Перетащите фото сюда")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/11-NEW-portfolio-dark.png`, fullPage: true });

  // ---- Необратимые действия: осталось ровно одно ----
  // FIX-STUDIO-ARCHIVE-REMOVED: «Архивировать» было вторым именем тумблера
  // «Опубликован» и стояло в разделе точки невозврата. Его отсутствие —
  // утверждение спеки, а не побочный эффект.
  await page.goto(`${baseURL}/cabinet/studio/settings?section=danger`);
  await expect(page.getByRole("button", { name: "Удалить студию", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Архивировать", exact: true })).toHaveCount(0);

  // ---- Light theme captures ----
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.goto(`${baseURL}/cabinet/studio/settings`);
  await expect(page.getByPlaceholder("+7 900 000 00 00")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/10-NEW-profile-light.png`, fullPage: true });
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
