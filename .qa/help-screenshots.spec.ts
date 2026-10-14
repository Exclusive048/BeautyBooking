// HELP-GUIDE-01 — снимки экранов для базы знаний (/help) и FAQ (/faq).
//
// Снимает экраны на телефоне (PWA — основной носитель кабинета) под
// showcase-аккаунтами и кладёт сжатые копии в `public/help/<имя>.webp`; их
// показывают превью в ответах (`HelpShots`, по нажатию — во весь экран).
//
// Спека НЕ входит в обычный прогон: она перезаписывает файлы в `public/`.
// Запуск — только явно, когда интерфейс поменялся и картинки устарели:
//
//   HELP_SHOTS=1 npx playwright test .qa/help-screenshots.spec.ts
//
// (нужны dev-сервер, `masterryadom-db`, Redis и прогнанный `seed:test`).
// `HELP_SHOTS=<имя>,<имя>` — переснять только выбранные кадры.
//
// Сырые PNG — в `.qa/diagnostics/help-shots/` (gitignored).

import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { ROLES, type Role, type RoleKey } from "./roles";
import { contextForRole, storageStatePath } from "./session";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const RAW_DIR = path.join(".qa", "diagnostics", "help-shots");
const OUT_DIR = path.join("public", "help");

const ENABLED = Boolean(process.env.HELP_SHOTS);
const ONLY = new Set(
  (process.env.HELP_SHOTS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && name !== "1"),
);

/** Телефон: 390 CSS px, плотность 2 — как у большинства смартфонов. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: "light" as const,
  // userAgent решает вид расписания на сервере (телефон → день).
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

/** Ширина файла: 2× от 390 — чётко во весь экран и лёгкий файл. */
const OUT_WIDTH = 780;

function role(key: RoleKey): Role {
  const found = ROLES.find((item) => item.key === key);
  if (!found) throw new Error(`Нет роли ${key} в .qa/roles.ts`);
  return found;
}

function wanted(name: string): boolean {
  return ONLY.size === 0 || ONLY.has(name);
}

async function settle(page: Page, ms = 700): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
  // Появление блоков (framer пишет прозрачность в style) и картинки: в dev
  // гидрация долгая, и без ожидания на снимок попадает пустая шапка.
  await page
    .waitForFunction(
      () => {
        const fading = Array.from(document.querySelectorAll<HTMLElement>("[style*='opacity']")).some(
          (el) => {
            const value = Number.parseFloat(el.style.opacity);
            return Number.isFinite(value) && value > 0 && value < 1;
          },
        );
        const hidden = Array.from(document.querySelectorAll<HTMLElement>("h1[style*='opacity']")).some(
          (el) => el.style.opacity === "0",
        );
        const loading = Array.from(document.images).some((img) => !img.complete);
        return !fading && !hidden && !loading;
      },
      undefined,
      { timeout: 15_000, polling: 250 },
    )
    .catch(() => undefined);
}

/**
 * Приветствие этапа тестирования (WELCOME-DIALOG-01) показывается аккаунту
 * один раз — у свежего сида оно перекрывает первый же экран. «Начать»
 * закрывает его навсегда (`POST /api/me/welcome`).
 */
async function dismissWelcome(page: Page): Promise<void> {
  const start = page.getByRole("button", { name: "Начать", exact: true });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await expect(start).toBeHidden();
    await settle(page, 400);
  }
}

/**
 * Данные, которые экран догружает сам: скелетоны (`animate-pulse`) и строки
 * «Загружаем…». Постоянная пульсация (точка «в сети») ждёт до таймаута и
 * снимок не ломает.
 */
async function waitLoaded(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const visible = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        };
        const skeleton = Array.from(document.querySelectorAll(".animate-pulse")).some(
          (el) => visible(el) && el.getBoundingClientRect().width > 40,
        );
        const loadingText = Array.from(document.querySelectorAll("p, span, div")).some(
          (el) => el.childElementCount === 0 && /^Загружаем/.test(el.textContent?.trim() ?? "") && visible(el),
        );
        // Выбор города в шапке до ответа `/api/cities` подписан «Город» —
        // на снимке должен быть город посетителя.
        const cityPending = Array.from(document.querySelectorAll("header button")).some(
          (el) => el.textContent?.trim() === "Город" && visible(el),
        );
        return !skeleton && !loadingText && !cityPending;
      },
      undefined,
      { timeout: 60_000, polling: 300 },
    )
    .catch(() => undefined);
}

async function open(page: Page, url: string, readyTestId?: string): Promise<void> {
  // Первая компиляция страницы в dev-режиме бывает дольше минуты.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 30_000 });
  await settle(page, 1200);
  await dismissWelcome(page);
  await waitLoaded(page);
  if (readyTestId) {
    // Список грузится после гидратации — без ожидания на снимке скелетоны.
    await expect(page.getByTestId(readyTestId).first()).toBeVisible({ timeout: 30_000 });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 1200);
}

async function clickButton(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole("button", { name }).first().click();
  await settle(page);
  await waitLoaded(page);
  await settle(page, 400);
}

async function openMoreSheet(page: Page): Promise<void> {
  // У «Ещё» бывает точка «ждёт действия» — она входит в имя кнопки.
  await page.getByRole("button", { name: /^Ещё/ }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await settle(page);
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const raw = path.join(RAW_DIR, `${name}.png`);
  await page.screenshot({ path: raw, animations: "disabled" });
  await sharp(raw)
    .resize({ width: OUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: 76, effort: 6 })
    .toFile(path.join(OUT_DIR, `${name}.webp`));
}

type Step = { name: string; run: (page: Page) => Promise<void> };

/**
 * Один контекст «телефона» на роль; кадр, который не удалось снять, не
 * останавливает остальные — список отказов проверяется в конце.
 */
async function capture(browser: Browser, key: RoleKey, steps: Step[]): Promise<void> {
  const selected = steps.filter((step) => wanted(step.name));
  if (selected.length === 0) return;

  // Прогрев `/login`: первая компиляция в dev дольше таймаута входа харнесса.
  const warmup = await browser.newPage();
  await warmup.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await warmup.close();

  // Свежая сессия (или один живой вход) — в контексте харнесса, затем то же
  // состояние открываем «телефоном».
  const { context: loginContext } = await contextForRole(browser, role(key), BASE_URL);
  await loginContext.close();
  const context = await browser.newContext({ ...PHONE, storageState: storageStatePath(role(key)) });
  // Город и cookie-уведомление — как у вернувшегося посетителя (см. `.qa/login.ts`).
  await context.addCookies([
    { name: "mr-city-slug", value: "moscow", url: BASE_URL },
    { name: "mr_cookie_notice", value: "1.0:n", url: BASE_URL },
  ]);
  // Значок dev-сборки Next в углу — не часть продукта. Город — основное
  // хранилище выбора (localStorage), cookie — лишь его зеркало.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
    } catch {
      // localStorage недоступен — останется cookie.
    }
    const hide = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(style);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });

  // Приветствие догружается отдельным чанком и всплывает позже первого
  // экрана — закрываем его заранее тем же вызовом, что и кнопка «Начать».
  await context.request.post(`${BASE_URL}/api/me/welcome`);

  const page = await context.newPage();
  const failures: string[] = [];
  try {
    for (const step of selected) {
      try {
        await step.run(page);
        await shot(page, step.name);
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        failures.push(`${step.name}: ${message}`);
      }
    }
  } finally {
    await context.close();
  }
  expect(failures, failures.join("\n")).toEqual([]);
}

test.describe("HELP-GUIDE-01 · снимки базы знаний", () => {
  test.skip(!ENABLED, "Только по HELP_SHOTS=1 — спека перезаписывает public/help.");
  test.setTimeout(8 * 60_000);

  test("мастер", async ({ browser }) => {
    await capture(browser, "master", [
      { name: "master-dashboard", run: (page) => open(page, "/cabinet/master/dashboard") },
      {
        name: "master-more",
        run: async (page) => {
          await open(page, "/cabinet/master/dashboard");
          await openMoreSheet(page);
        },
      },
      { name: "master-profile", run: (page) => open(page, "/cabinet/master/profile") },
      { name: "master-services", run: (page) => open(page, "/cabinet/master/services") },
      {
        name: "master-service-new",
        run: async (page) => {
          await open(page, "/cabinet/master/services");
          await clickButton(page, "Добавить услугу");
        },
      },
      { name: "master-portfolio", run: (page) => open(page, "/cabinet/master/portfolio") },
      { name: "master-schedule", run: (page) => open(page, "/cabinet/master/schedule") },
      {
        name: "master-schedule-settings",
        run: (page) => open(page, "/cabinet/master/schedule/settings"),
      },
      {
        name: "master-plan-wizard",
        run: async (page) => {
          await open(page, "/cabinet/master/schedule/settings");
          await clickButton(page, "Настроить график");
        },
      },
      {
        name: "master-rules",
        run: (page) => open(page, "/cabinet/master/schedule/settings?tab=rules"),
      },
      {
        name: "master-visibility",
        run: (page) => open(page, "/cabinet/master/schedule/settings?tab=visibility"),
      },
      { name: "master-bookings", run: (page) => open(page, "/cabinet/master/bookings") },
      {
        name: "master-booking-new",
        run: async (page) => {
          await open(page, "/cabinet/master/bookings");
          await clickButton(page, "Новая запись");
        },
      },
      { name: "master-clients", run: (page) => open(page, "/cabinet/master/clients") },
      { name: "master-reviews", run: (page) => open(page, "/cabinet/master/reviews") },
      { name: "master-public", run: (page) => open(page, "/cabinet/master/settings/public") },
    ]);
  });

  test("студия", async ({ browser }) => {
    await capture(browser, "studio-admin", [
      { name: "studio-dashboard", run: (page) => open(page, "/cabinet/studio") },
      {
        name: "studio-more",
        run: async (page) => {
          await open(page, "/cabinet/studio");
          await openMoreSheet(page);
        },
      },
      {
        name: "studio-profile",
        run: (page) => open(page, "/cabinet/studio/settings?section=profile"),
      },
      { name: "studio-team", run: (page) => open(page, "/cabinet/studio/team") },
      {
        name: "studio-invite",
        run: async (page) => {
          await open(page, "/cabinet/studio/team");
          await clickButton(page, "Пригласить мастера");
        },
      },
      { name: "studio-services", run: (page) => open(page, "/cabinet/studio/services") },
      { name: "studio-calendar", run: (page) => open(page, "/cabinet/studio/calendar") },
      {
        name: "studio-team-schedule",
        run: (page) => open(page, "/cabinet/studio/schedule/team"),
      },
      {
        name: "studio-schedule-settings",
        run: (page) => open(page, "/cabinet/studio/schedule/settings"),
      },
      { name: "studio-requests", run: (page) => open(page, "/cabinet/studio/schedule-requests") },
      { name: "studio-bookings", run: (page) => open(page, "/cabinet/studio/bookings") },
      {
        name: "studio-policy",
        run: (page) => open(page, "/cabinet/studio/settings?section=policy"),
      },
      {
        name: "studio-portfolio",
        run: (page) => open(page, "/cabinet/studio/settings?section=portfolio"),
      },
      { name: "studio-public", run: (page) => open(page, "/cabinet/studio/settings/public") },
    ]);
  });

  test("клиент", async ({ browser }) => {
    await capture(browser, "client", [
      { name: "client-catalog", run: (page) => open(page, "/catalog", "catalog-card") },
      { name: "client-master-page", run: (page) => open(page, "/u/anna-sokolova") },
      {
        name: "client-booking",
        run: async (page) => {
          await open(page, "/u/anna-sokolova");
          // Часть кнопок «Записаться» лишь прокручивает к карточке «Запись»;
          // окно записи открывает кнопка в самой карточке — жмём по очереди.
          const buttons = page.getByRole("button", { name: "Записаться", exact: true });
          // Невидимый диалог на странице тоже есть — смотрим только видимые.
          const dialog = page.getByRole("dialog").filter({ visible: true });
          const count = await buttons.count();
          for (let index = 0; index < count && (await dialog.count()) === 0; index += 1) {
            const button = buttons.nth(index);
            if (!(await button.isVisible())) continue;
            await button.click();
            await page.waitForTimeout(1200);
          }
          await expect(dialog.first()).toBeVisible({ timeout: 30_000 });
          await settle(page, 2500);
        },
      },
      {
        name: "client-bookings",
        run: async (page) => {
          await open(page, "/cabinet/bookings", "booking-row");
          // Карточка «Установите приложение» закрывает список — убираем её.
          const hide = page.getByRole("button", { name: "Скрыть", exact: true });
          if (await hide.first().isVisible().catch(() => false)) {
            await hide.first().click();
            await settle(page);
          }
        },
      },
      { name: "client-favorites", run: (page) => open(page, "/cabinet/favorites") },
    ]);
  });
});
