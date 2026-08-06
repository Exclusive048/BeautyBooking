import { mkdirSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ROLES } from "./roles";
import { contextForRole } from "./session";

/**
 * RES-28 — живой осмотр пустых состояний после перевода на общий `EmptyState`.
 *
 * Проверяем то, чего до правки не существовало: кнопку «Сбросить фильтры» в
 * отфильтрованном пустом списке и её адрес. Пустое состояние достигается
 * фильтром, который заведомо ничего не находит (`?q=zzzzzz`), — данные сидов
 * при этом не трогаются.
 */

const OUT = process.env.RES28_OUT ?? ".qa/diagnostics/res-28";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("мастер: пустой отфильтрованный список клиентов даёт сброс фильтров", async ({ browser }) => {
  const role = ROLES.find((r) => r.key === "master")!;
  const { context: ctx, page } = await contextForRole(browser, role, BASE);

  await page.goto(`${BASE}/cabinet/master/clients?q=zzzzzz`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main").last()).toBeVisible();

  const reset = page.getByRole("link", { name: "Сбросить фильтры" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute("href", "/cabinet/master/clients");

  await page.screenshot({ path: path.join(OUT, "master-clients-filtered.png") });
  await ctx.close();
});

test("студия: пустой отфильтрованный список клиентов даёт сброс фильтров", async ({ browser }) => {
  const role = ROLES.find((r) => r.key === "studio-admin")!;
  const { context: ctx, page } = await contextForRole(browser, role, BASE);

  await page.goto(`${BASE}/cabinet/studio/clients?q=zzzzzz`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("main").last()).toBeVisible();

  const reset = page.getByRole("link", { name: "Сбросить фильтры" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute("href", "/cabinet/studio/clients");
  // текст обязан говорить про фильтр, а не «клиенты появятся после первых
  // записей»: клиенты в базе есть, их просто не нашёл запрос
  await expect(page.getByText("Под фильтр никто не попал")).toBeVisible();

  await page.screenshot({ path: path.join(OUT, "studio-clients-filtered.png") });

  // Тёмная тема: примитив красится токенами, но проверяем, а не предполагаем —
  // next-themes читает ключ при инициализации, поэтому нужен reload.
  await page.evaluate(() => window.localStorage.setItem("theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Сбросить фильтры" })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "studio-clients-filtered-dark.png") });

  await ctx.close();
});
