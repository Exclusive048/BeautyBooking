import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * FIX-D2 — публичные поверхности не шире экрана телефона.
 *
 * ## Зачем спека, если есть сторож в `src/`
 *
 * `lib/ui/horizontal-strip.test.ts` ловит один механизм — «`min-w-max` на
 * скролл-контейнере». Переполнить страницу можно десятком других (жёсткая
 * ширина, `whitespace-nowrap`, таблица без обёртки, декор без клипа), и все
 * они — ПОВЕДЕНИЕ, измеримое только браузером. Здесь измеряется само
 * свойство: страница помещается в экран.
 *
 * ## Почему НЕ `window.scrollX` после `scrollTo` (урок SMOKE-01)
 *
 * В мобильной эмуляции Chrome layout-viewport РАСТЯГИВАЕТСЯ до ширины
 * содержимого (при 375-экране и 459-контенте — `innerWidth 459`, `innerHeight
 * 994`), поэтому документ «не переполняет» layout-viewport, `window.scrollX`
 * остаётся 0 по построению, а панорамируется ВИЗУАЛЬНЫЙ viewport
 * (`visualViewport.pageLeft`). Прямой признак дефекта — расхождение
 * `innerWidth` и `documentElement.clientWidth`; в desktop-эмуляции признак —
 * `scrollWidth > clientWidth`. Проверяются оба. Прямое следствие расширения
 * layout-viewport: всё `fixed bottom-0` уезжает под нижнюю кромку экрана —
 * поэтому третьей проверкой идёт «нижняя навигация видна».
 *
 * ## Что не проверяется
 *
 * Логин не нужен — только публичные поверхности; кабинеты (со своим
 * `min-w-[920px]`-журналом внутри скролл-контейнера) сюда не входят.
 * Список поверхностей — ручной, его протухание = «зелено, потому что не
 * смотрели»: добавляя публичный маршрут, добавьте его сюда.
 *
 * Прогон: `npx playwright test .qa/no-horizontal-overflow.spec.ts`
 * (dev-сервер на :3000, сиды прогнаны). Диагностика — `.qa/diagnostics/fix-d2/`.
 */

const OUT = process.env.FIXD2_OUT ?? ".qa/diagnostics/fix-d2";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";

const SURFACES = [
  "/",
  "/catalog",
  "/models",
  "/u/anna-sokolova",
  "/u/vision-marina-lebedeva-1",
  "/u/vision-studio",
];
const WIDTHS = [320, 375];

// Мобильная эмуляция Chromium (без `devices[…]`: дескрипторы iPhone тянут
// WebKit, которого в проекте нет; `isMobile` — то, что включает мобильную
// логику viewport'а в Blink, ради неё спека и написана).
test.use({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  // Прекэш SW отравляет повторные прогоны (QA-003).
  serviceWorkers: "block",
});

test.describe("публичные поверхности помещаются в экран телефона", () => {
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      test(`${surface} @ ${width}px`, async ({ page, context }) => {
        mkdirSync(OUT, { recursive: true });
        await context.addCookies([
          { name: "mr_cookie_notice", value: "1.0:n", url: BASE },
          { name: "mr-city-slug", value: "moscow", url: BASE },
        ]);
        await page.setViewportSize({ width, height: 812 });
        await page.goto(surface, { waitUntil: "load" });
        // Секции стримятся; ждём СТАБИЛЬНОСТИ ширины документа (два одинаковых
        // чтения подряд), а не нужного значения — иначе на сломанной странице
        // проверка молча ждёт весь таймаут и падает не на том утверждении.
        await expect
          .poll(
            async () => {
              const first = await page.evaluate(() => document.documentElement.scrollWidth);
              await page.waitForTimeout(700);
              const second = await page.evaluate(() => document.documentElement.scrollWidth);
              return first === second;
            },
            { timeout: 20_000, intervals: [300] },
          )
          .toBe(true);
        const m = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bottomNavTop: document.querySelector("nav.fixed.bottom-0")?.getBoundingClientRect().top ?? null,
          vvHeight: window.visualViewport?.height ?? null,
        }));
        // Мобильный признак: layout-viewport не растянулся до содержимого.
        expect(m.innerWidth, "innerWidth ≠ clientWidth ⇒ layout-viewport растянут содержимым").toBe(m.clientWidth);
        // Desktop-признак: у документа нет горизонтального переполнения.
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
        // Следствие: нижняя навигация стоит внутри визуального viewport.
        if (m.bottomNavTop !== null && m.vvHeight !== null) {
          expect(m.bottomNavTop, "fixed bottom-0 nav below the visible screen").toBeLessThan(m.vvHeight);
        }
        // Реальный тач-пан по телу страницы не должен двигать визуальный viewport.
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: width - 40, y: 400 }] });
        for (let x = width - 40; x >= 40; x -= 20) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 400 }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(400);
        const pageLeft = await page.evaluate(() => window.visualViewport?.pageLeft ?? 0);
        expect(pageLeft, "touch pan moved the whole page sideways").toBe(0);
        await page.screenshot({ path: path.join(OUT, `spec-${surface.replace(/[^a-z0-9]+/gi, "_") || "home"}-${width}.png`) });
      });
    }
  }
});
