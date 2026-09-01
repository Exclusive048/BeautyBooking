import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * PWA-FIX-04 — всё, что есть в сайдбаре кабинета мастера, доступно и с телефона.
 *
 * 🔴 Дефект. Сайдбар (`MasterSidebar`) рендерится только с `lg:`; на телефоне
 * и в PWA единственная навигация — нижняя (`MasterBottomNav`: четыре вкладки +
 * лист «Ещё»). Три раздела сайдбара в нижней навигации отсутствовали —
 * «Настройки расписания», «Уведомления», «Сообщения». Замечание владельца
 * из PWA: «нет возможности настроить расписание» — и это было буквально так:
 * единственный мобильный вход в настройки графика был условной ссылкой в блоке
 * «Требует внимания» на дашборде, которая показывается не всегда.
 *
 * Сторож формулирует свойство как ПОДМНОЖЕСТВО (тот же приём, что
 * `components/layout/user-menu-parity.test.ts`, PWA-FIX-01): у нижней
 * навигации есть свои пункты («Тариф», «Модели», «Моя страница»), и требовать
 * их зеркала в сайдбаре — не про этот дефект. Проверяется одно направление —
 * «с телефона не меньше, чем с десктопа».
 *
 * @probe Проба на правдоподобной форме — удалением из `MORE_ITEMS` строки с
 * `/cabinet/master/schedule/settings` (то есть возвратом дефекта, а не выдуманной
 * ссылкой): тест краснеет со списком из одного пути. Вторая проба — тот же путь,
 * оставленный только в комментарии рядом с `MORE_ITEMS`: `stripComments` не
 * засчитывает прозу, тест остаётся красным. Третья — сайдбар переписан так, что
 * сканер не находит ни одной ссылки: срабатывает защита от вакуума.
 */

const SIDEBAR = "src/features/master/components/master-sidebar.tsx";
const BOTTOM_NAV = "src/features/master/components/master-bottom-nav.tsx";
const SCHEDULE_PAGE = "src/features/master/components/schedule/master-schedule-page.tsx";
const SCHEDULE_SETTINGS_LINK = "src/features/master/components/schedule/schedule-settings-link.tsx";

/**
 * Разделы, у которых на телефоне другой адрес ТОГО ЖЕ места. Сайдбар уходит
 * сразу на дефолтную под-страницу настроек (без промежуточного 302), нижняя
 * навигация — на индекс, который на неё же редиректит.
 */
const MOBILE_EQUIVALENT: Record<string, string> = {
  "/cabinet/master/account/notifications": "/cabinet/master/account",
};

function read(file: string): string {
  return stripComments(readFileSync(path.join(process.cwd(), file), "utf8"));
}

/** Ссылки сайдбара — значения таблицы `HREF` (единственный источник его путей). */
function sidebarHrefs(): Set<string> {
  const source = read(SIDEBAR);
  const block = source.match(/const HREF = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
  const found = new Set<string>();
  for (const match of block.matchAll(/"(\/cabinet\/master[^"]*)"/g)) found.add(match[1]!);
  return found;
}

/** Ссылки нижней навигации — и вкладки, и лист «Ещё», и JSX-ссылки в нём. */
function bottomNavHrefs(): Set<string> {
  const source = read(BOTTOM_NAV);
  const found = new Set<string>();
  for (const match of source.matchAll(/href[:=]\s*"(\/cabinet\/master[^"]*)"/g)) found.add(match[1]!);
  return found;
}

describe("PWA-FIX-04 · паритет навигации кабинета мастера", () => {
  it("нижняя навигация несёт все разделы сайдбара", () => {
    const sidebar = sidebarHrefs();
    const bottom = bottomNavHrefs();

    // Защита от вакуума: сканер, не нашедший ссылок, зеленел бы на чём угодно.
    expect(sidebar.size, `${SIDEBAR}: таблица HREF не найдена — сканер устарел`).toBeGreaterThan(5);
    expect(bottom.size, `${BOTTOM_NAV}: ссылки не найдены — сканер устарел`).toBeGreaterThan(5);

    const missing = [...sidebar]
      .filter((href) => !bottom.has(MOBILE_EQUIVALENT[href] ?? href))
      .sort();

    expect(
      missing,
      `эти разделы есть в сайдбаре и недоступны с телефона (ни вкладки, ни пункта «Ещё»):\n${missing.join("\n")}\n` +
        "сайдбар рендерится только с lg:, других входов у мобильного кабинета нет.",
    ).toEqual([]);
  });

  it("настройки расписания достижимы и из «Ещё», и со страницы расписания", () => {
    expect(bottomNavHrefs().has("/cabinet/master/schedule/settings")).toBe(true);

    // Вход с самой страницы: иконка-ссылка в шапке рядом с «Обновить». На
    // десктопе рядом стоит сайдбар, на телефоне — нет, и это единственная
    // подсказка «где настраивать», не требующая открыть лист «Ещё».
    expect(read(SCHEDULE_PAGE)).toMatch(/<ScheduleSettingsLink\s*\/>/);
    expect(read(SCHEDULE_SETTINGS_LINK)).toMatch(/href="\/cabinet\/master\/schedule\/settings"/);
  });
});
