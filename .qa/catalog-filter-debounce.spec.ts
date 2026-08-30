import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * CATALOG-FILTER-DEBOUNCE — сколько сетевых запросов рождает ОДНО движение
 * ползунка каталога.
 *
 * Фильтры каталога живут в URL: изменение → `router.replace` (RSC-запрос
 * `?_rsc=`) → новый `/api/catalog/search`. У `<input type="range">` событие
 * летит на каждый шаг, поэтому «до» одно перетаскивание = N навигаций +
 * N запросов; «после» (`useDeferredCommit`) — черновик сразу, коммит один.
 *
 * Измеряется поведением, а не чтением кода: клавиатурные шаги по ползунку
 * (реальные события, как у пользователя) и подсчёт запросов за окно тишины.
 * Та же спека гоняется против двух база-URL — «до» (боевой сервер со старым
 * кодом) и «после» (локальная прод-сборка), см. `results-*.json` рядом.
 *
 * Прогон: `QA_BASE_URL=<база> DEBOUNCE_LABEL=after npx playwright test .qa/catalog-filter-debounce.spec.ts`
 * (спека — в `.qa/` и трекается; результаты — в `.qa/diagnostics/catalog-filter-debounce/`, вне git,
 * как у остальных диагностик). «before» снят с боевого сервера до выкатки, «after» — с локальной
 * прод-сборки (`node .next/standalone/server.js`, порт 3100).
 */

const OUT = ".qa/diagnostics/catalog-filter-debounce";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const LABEL = process.env.DEBOUNCE_LABEL ?? "run";
const SETTLE_MS = 2500;

type Burst = { events: number; search: number; rsc: number; prefetch: number; urls: string[] };

// Навигация фильтра — это RSC-запрос САМОЙ страницы каталога. Остальные `_rsc=`
// (например `/u/<мастер>/booking?_rsc=`) — prefetch ссылок на карточках, они
// приезжают вместе с результатами и к фильтру отношения не имеют; считаются
// отдельно, чтобы не путать одно с другим.
const isCatalogNav = (u: string) => /^\/catalog(\?|$)/.test(u) && /[?&]_rsc=/.test(u);
const isPrefetch = (u: string) => /[?&]_rsc=/.test(u) && !isCatalogNav(u);

async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const r = [...document.querySelectorAll("input[type=range]")].find((i) => (i as HTMLInputElement).max === "5");
      return !!r && Object.keys(r).some((k) => k.startsWith("__reactFiber"));
    },
    null,
    { timeout: 60_000 },
  );
}

async function burst(page: Page, label: string, keys: number, stepDelayMs: number): Promise<Burst> {
  const urls: string[] = [];
  const onReq = (req: { url(): string }) => {
    const u = req.url();
    if (/\/api\/catalog\/search|[?&]_rsc=/.test(u)) urls.push(u.replace(BASE, ""));
  };
  page.on("request", onReq);
  await page.getByLabel(label, { exact: true }).first().focus();
  for (let i = 0; i < keys; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(stepDelayMs);
  }
  await page.waitForTimeout(SETTLE_MS);
  page.off("request", onReq);
  return {
    events: keys,
    search: urls.filter((u) => u.includes("/api/catalog/search")).length,
    rsc: urls.filter(isCatalogNav).length,
    prefetch: urls.filter(isPrefetch).length,
    urls: urls.filter((u) => !isPrefetch(u)).slice(0, 6),
  };
}

test("ползунки рейтинга и цены: запросов на серию шагов", async ({ page }) => {
  await page.goto(`${BASE}/catalog`, { waitUntil: "load" });
  await waitForHydration(page);
  // Первичная загрузка результатов — вне замера.
  await page.waitForTimeout(3000);

  const rating = await burst(page, "Рейтинг", 8, 30);
  // Подпись «N+» обязана ходить за черновиком — иначе ползунок «залипает».
  const ratingLabel = await page
    .locator("section", { has: page.getByLabel("Рейтинг", { exact: true }) })
    .locator("span.font-mono")
    .first()
    .textContent();

  const price = await burst(page, "Минимальная цена", 20, 20);

  const result = { base: BASE, label: LABEL, url: page.url().replace(BASE, ""), ratingLabel, rating, price };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `results-${LABEL}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));

  // Утверждение только для режима «после»: одна серия = не больше одной
  // навигации и одного запроса каталога. Для «до» спека — измерение.
  if (LABEL === "after") {
    expect(rating.search, "рейтинг: запросов каталога на серию").toBeLessThanOrEqual(1);
    expect(price.search, "цена: запросов каталога на серию").toBeLessThanOrEqual(1);
    expect(rating.rsc).toBeLessThanOrEqual(1);
    expect(price.rsc).toBeLessThanOrEqual(1);
    expect(ratingLabel?.trim()).toBe("4+");
  }
});
