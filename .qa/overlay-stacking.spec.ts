import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ROLES } from "./roles";
import { contextForRole, storageStatePath } from "./session";

/**
 * 29.09 доработки · 21 (UI-14) — «кто сверху» проверяется ПОВЕДЕНИЕМ, а не
 * чтением чисел: `document.elementFromPoint` в точке, где слои перекрываются,
 * обязан попасть в тот слой, который должен быть сверху. Классовый сторож
 * (`src/lib/ui/z-index-scale.test.ts`) лишь не даёт расти магическим числам;
 * контекст наложения у предка (`sticky`, `transform`, `backdrop-filter`) он не
 * видит — так меню шапки с `z-[100]` жило под нижней навигацией.
 *
 * Сценарии — телефон 375×812 и ПК 1280×800 (плюс «короткий» телефон 375×560,
 * где меню шапки гарантированно доходит до cookie-уведомления и нижней панели),
 * светлая и тёмная тема:
 *   1. кабинет мастера, открыта модалка → в центре нижней панели (ПК — шапки)
 *      элемент внутри `[role=dialog]`;
 *   2. гость, видно cookie-уведомление, открыто меню шапки → центр самого
 *      нижнего пункта меню внутри меню;
 *   3. расписание мастера, открыто меню действий записи → центр каждого пункта
 *      внутри меню;
 *   4. подсказка «Первых шагов» при видимом cookie-уведомлении → центр
 *      подсказки внутри подсказки (не перекрыта).
 *
 * @probe 2026-09-30: мобильное меню шапки возвращено внутрь `TopbarShell` (без
 *   `AnchoredPortal`, `absolute right-0 z-[100]`) → сценарий 2 красный на
 *   375×560: «меню шапки: в точке пункта — p «Файлы cookie»». Сценарий 4 до
 *   исправления (cookie-уведомление без `data-guide-avoid`) был красным сам:
 *   «подсказка: в её центре — p» — находка спеки, п. 6.
 */

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUT = ".qa/diagnostics/overlay-stacking";
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 375, height: 812 };
const SHORT_PHONE = { width: 375, height: 560 };
const PC = { width: 1280, height: 800 };

async function ctx(browser: Browser, opts: { role?: string; viewport: { width: number; height: number }; dark: boolean; cookieAck: boolean }) {
  const phone = opts.viewport.width < 500;
  const context = await browser.newContext({
    viewport: opts.viewport,
    serviceWorkers: "block",
    colorScheme: opts.dark ? "dark" : "light",
    isMobile: phone,
    hasTouch: phone,
    storageState: opts.role ? storageStatePath(ROLES.find((r) => r.key === opts.role)!) : undefined,
  });
  const cookies = [{ name: "mr-city-slug", value: "moscow", url: BASE }];
  if (opts.cookieAck) cookies.push({ name: "mr_cookie_notice", value: "1.0:n", url: BASE });
  // Сохранённая сессия несёт куку подтверждения (её ставит логин харнесса) —
  // без сброса cookie-уведомление не появилось бы, и сценарий был бы пустым.
  else await context.clearCookies({ name: "mr_cookie_notice" });
  await context.addCookies(cookies);
  return { context, page: await context.newPage() };
}

async function open(page: Page, url: string) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForTimeout(1200);
}

/** Элемент в точке и попал ли он внутрь `selector`. */
async function hitAt(page: Page, x: number, y: number, selector: string) {
  return page.evaluate(
    ({ x, y, selector }) => {
      const el = document.elementFromPoint(x, y);
      const describe = (n: Element | null) =>
        n ? `${n.tagName.toLowerCase()}${n.getAttribute("data-testid") ? `[${n.getAttribute("data-testid")}]` : ""}${n.getAttribute("aria-label") ? `(${n.getAttribute("aria-label")})` : ""}` : "null";
      return { inside: Boolean(el?.closest(selector)), hit: describe(el) };
    },
    { x, y, selector },
  );
}

async function ensureFresh(browser: Browser, role: string) {
  const r = ROLES.find((x) => x.key === role)!;
  const { context } = await contextForRole(browser, r, BASE);
  await context.close();
}

test.setTimeout(1_800_000);

for (const dark of [false, true]) {
  const theme = dark ? "dark" : "light";

  test(`1. модалка поверх нижней панели и шапки — ${theme}`, async ({ browser }) => {
    await ensureFresh(browser, "master");
    for (const viewport of [PHONE, PC]) {
      const { context, page } = await ctx(browser, { role: "master", viewport, dark, cookieAck: true });
      await open(page, "/cabinet/master/dashboard");
      await page.getByRole("button", { name: /Новая запись/ }).first().click();
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500);
      const target = viewport === PHONE ? page.locator("nav.fixed").last() : page.locator("header").first();
      const box = await target.boundingBox();
      expect(box, "нет нижней панели / шапки").not.toBeNull();
      const res = await hitAt(page, box!.x + box!.width / 2, box!.y + box!.height / 2, "[role=dialog]");
      await page.screenshot({ path: path.join(OUT, `1-modal-${viewport.width}-${theme}.png`) });
      expect(res.inside, `модалка: в точке ${viewport === PHONE ? "нижней панели" : "шапки"} — ${res.hit}`).toBe(true);
      await context.close();
    }
  });

  test(`2. меню шапки поверх cookie-уведомления и нижней панели — ${theme}`, async ({ browser }) => {
    for (const viewport of [PHONE, SHORT_PHONE, PC]) {
      const { context, page } = await ctx(browser, { viewport, dark, cookieAck: false });
      await open(page, "/");
      await expect(page.getByRole("region", { name: /cookie|куки/i }).first()).toBeVisible({ timeout: 30_000 });
      // Телефон — мобильное меню, ПК — выбор города (у гостя это меню шапки).
      const trigger =
        viewport.width < 500
          ? page.getByRole("button", { name: "Открыть меню" }).first()
          : page.getByRole("button", { name: "Выбор города" }).first();
      await trigger.click();
      // Меню ищется по содержимому, а не по слою: сторож обязан краснеть и
      // тогда, когда меню снова отрисовано внутри шапки.
      const panel =
        viewport.width < 500
          ? page.locator("div.rounded-3xl").filter({ has: page.getByRole("link", { name: "Тарифы" }) }).last()
          : page.getByRole("listbox").first();
      await expect(panel).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(400);
      const items = panel.locator("a, button, [role=option]");
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      const last = items.nth(count - 1);
      const lastBox = await last.boundingBox();
      const res = await last.evaluate(
        (el, { x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return { inside: Boolean(hit && el.contains(hit)), hit: hit ? `${hit.tagName.toLowerCase()} «${(hit.textContent ?? "").trim().slice(0, 30)}»` : "null" };
        },
        { x: lastBox!.x + lastBox!.width / 2, y: lastBox!.y + lastBox!.height / 2 },
      );
      await page.screenshot({ path: path.join(OUT, `2-menu-${viewport.width}x${viewport.height}-${theme}.png`) });
      expect(res.inside, `меню шапки: в точке пункта — ${res.hit}`).toBe(true);
      await context.close();
    }
  });

  test(`3. меню действий записи поверх расписания — ${theme}`, async ({ browser }) => {
    await ensureFresh(browser, "master");
    for (const viewport of [PHONE, PC]) {
      const { context, page } = await ctx(browser, { role: "master", viewport, dark, cookieAck: true });
      await open(page, "/cabinet/master/schedule?view=week");
      const trigger = page.getByRole("button", { name: "Действия" }).first();
      if ((await trigger.count()) === 0) {
        test.info().annotations.push({ type: "skip-part", description: `нет записей в расписании на ${viewport.width}` });
        await context.close();
        continue;
      }
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const menu = page.getByRole("menu").first();
      await expect(menu).toBeVisible({ timeout: 15_000 });
      const items = menu.getByRole("menuitem").or(menu.locator("button"));
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        const b = await items.nth(i).boundingBox();
        if (!b) continue;
        const res = await hitAt(page, b.x + b.width / 2, b.y + b.height / 2, "[role=menu]");
        expect(res.inside, `меню записи, пункт ${i}: ${res.hit}`).toBe(true);
      }
      await page.screenshot({ path: path.join(OUT, `3-booking-menu-${viewport.width}-${theme}.png`) });
      await context.close();
    }
  });

  test(`4. подсказка «Первых шагов» не перекрыта cookie-уведомлением — ${theme}`, async ({ browser }) => {
    await ensureFresh(browser, "master");
    for (const viewport of [PHONE, PC]) {
      const { context, page } = await ctx(browser, { role: "master", viewport, dark, cookieAck: false });
      await open(page, "/cabinet/master/profile?guide=profile");
      await expect(page.getByRole("region", { name: /cookie|куки/i }).first()).toBeVisible({ timeout: 30_000 });
      const hint = page.getByTestId("setup-guide-hint");
      await expect(hint).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      const b = await hint.boundingBox();
      const res = await hitAt(page, b!.x + b!.width / 2, b!.y + b!.height / 2, "[data-testid=setup-guide-hint]");
      await page.screenshot({ path: path.join(OUT, `4-hint-${viewport.width}-${theme}.png`) });
      expect(res.inside, `подсказка: в её центре — ${res.hit}`).toBe(true);
      await context.close();
    }
  });
}
