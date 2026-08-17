/**
 * UI-18 — смоук изменённых CTA.
 *
 * Проверяется ровно то, чего не докажут гейты: строка доехала до доступного
 * имени кнопки на живой странице и раскладка шапки её выдержала. Состояние
 * сессии берётся через `contextForRole` (`.qa/session.ts`) — холодный логин
 * здесь не нужен и стоил бы OTP-бюджета (SEC-26: 10 запросов в час на
 * идентичность).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { ROLES } from "./roles";
import { contextForRole } from "./session";

const OUT = process.env.UI18_OUT ?? ".qa/diagnostics/ui-18";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const MASTER = ROLES.find((r) => r.key === "master")!;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("услуги: кнопки шапки называют действие", async ({ browser }) => {
  const { context, page } = await contextForRole(browser, MASTER, BASE);
  await page.goto("/cabinet/master/services", { waitUntil: "domcontentloaded" });

  // Видимая подпись намеренно осталась короткой (см. `text.ts`, UI-18):
  // проверяется ДОСТУПНОЕ имя, которое даёт `aria-label`. Снятие aria-label
  // вернёт имя «Услуга» и уронит обе нижние проверки.
  await expect(page.getByRole("button", { name: "Добавить услугу" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить пакет" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Услуга$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Пакет$/ })).toHaveCount(0);

  await page.screenshot({ path: path.join(OUT, "services-header.png") });

  // Обе подписи стали длиннее — на узком экране проверяем, что шапка их
  // переносит (`flex-wrap`), а не выдавливает за край.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByRole("button", { name: "Добавить услугу" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(OUT, "services-header-390.png") });
  await context.close();
});

test("аккаунт: карточка ролей ведёт глаголом", async ({ browser }) => {
  const { context, page } = await contextForRole(browser, MASTER, BASE);
  // Карточка ролей живёт на вкладке `account/account`; голый `/account`
  // редиректит на `notifications`.
  await page.goto("/cabinet/master/account/account", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "Управлять ролями" })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "account-roles.png") });
  await context.close();
});

test("настройки расписания: превью названо действием", async ({ browser }) => {
  const { context, page } = await contextForRole(browser, MASTER, BASE);
  await page.goto("/cabinet/master/schedule/settings", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "Открыть превью клиента" })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "schedule-settings-header.png") });
  await context.close();
});
