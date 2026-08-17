/**
 * UI-15 — разовый смоук общего `Checkbox`. Не CI-спека: живёт рядом с
 * остальными `.qa/*.spec.ts`, гоняется руками при проверке находки.
 *
 * Проверяет ровно то, что доходит до пикселей у нативного чекбокса
 * (`appearance: auto`): бренд-акцент вместо системного синего и собственное
 * кольцо фокуса. Главная поверхность — `DeleteAccountModal`: до UI-15 там
 * стоял сырой чекбокс браузера в необратимом действии.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";
import { ROLES } from "./roles";

const OUT = process.env.UI15_OUT ?? ".qa/diagnostics/ui-15";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";

type Probe = {
  accentColor: string;
  outlineStyle: string;
  focusBoxShadow: string;
  size: string;
};

async function probeCheckbox(page: import("@playwright/test").Page, selector: string): Promise<Probe> {
  return page.evaluate((sel) => {
    const cb = document.querySelector(sel) as HTMLInputElement;
    cb.focus();
    const s = getComputedStyle(cb);
    return {
      accentColor: s.accentColor,
      outlineStyle: s.outlineStyle,
      focusBoxShadow: s.boxShadow,
      size: `${s.width}x${s.height}`,
    };
  }, selector);
}

test("удаление аккаунта: чекбокс подтверждения в бренд-акценте и с кольцом фокуса", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));

  const client = ROLES.find((r) => r.key === "client")!;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(page, client, BASE);

  await page.goto(`${BASE}/cabinet/settings`, { waitUntil: "domcontentloaded" });
  // Секция «Опасная зона» — якорь `#delete-account`; ждём её, иначе клик
  // уходит до гидратации и модаль не открывается.
  await expect(page.locator("#delete-account")).toBeVisible();

  const box = page.locator('[role="dialog"] input[type="checkbox"]');
  // «клик → модаль» — ОДНА retry-единица: до гидратации кнопка уже в DOM, но
  // обработчик к ней не привязан, и клик пропадает без следа (та же гонка,
  // что `loginAs` ретраит на /login).
  await expect(async () => {
    await page.locator("#delete-account").getByRole("button", { name: /Удалить аккаунт/i }).click();
    await expect(box).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const probe = await probeCheckbox(page, '[role="dialog"] input[type="checkbox"]');
  // `accent-color: auto` — системный синий; это и было дефектом находки.
  expect(probe.accentColor).not.toBe("auto");
  // Базовый слой гасит outline у всех полей — кольцо обязано быть своим.
  expect(probe.outlineStyle).toBe("none");
  expect(probe.focusBoxShadow).not.toBe("none");

  await page.locator('[role="dialog"]').first().screenshot({ path: path.join(OUT, "delete-account-modal.png") });

  // Отмеченное состояние — единственное, где `accent-color` виден глазом.
  await box.check();
  await page.locator('[role="dialog"] label').first().screenshot({
    path: path.join(OUT, "delete-account-checked.png"),
  });

  await ctx.close();
});
