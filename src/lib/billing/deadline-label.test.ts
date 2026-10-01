import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { formatBillingDeadlineLabel } from "@/lib/billing/deadline-label";
import { listSourceFiles, walkClientGraph } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * LOGIC-25 — дедлайн opt-in-окна рендерился cron'ом через `dateRU`, у которого
 * нет параметра `timeZone` вовсе: дата считалась в ambient-tz процесса, то есть
 * по `TZ` контейнера. Граница суток — реальный риск: провайдер читает «до 12
 * августа», а cron экспайрит по инстанту, который у него уже 13-е.
 *
 * Якорь — Vision / Екатеринбург, GMT+5 (§5 скилла timezone-correctness):
 * проверять salon-tz поверхность только на Москве бессмысленно, там зритель
 * совпадает с салоном и ошибка невидима.
 */

const SRC_ROOT = resolve(process.cwd(), "src");
/** Клиентские поверхности, где viewer-tz — осознанный выбор (rule 17). */
const VIEWER_TZ_ALLOWED = [
  "src/lib/format.ts", // сам хелпер
  "src/features/billing/components/billing-page.tsx", // кабинет: читает владелец
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("formatBillingDeadlineLabel — LOGIC-25", () => {
  // 2026-08-12T20:30:00Z — в Москве ещё 12-е, в Екатеринбурге уже 13-е.
  const deadline = new Date("2026-08-12T20:30:00.000Z");

  it("дата считается в tz кабинета, а не процесса", () => {
    expect(formatBillingDeadlineLabel(deadline, "Asia/Yekaterinburg")).toContain("13");
    expect(formatBillingDeadlineLabel(deadline, "Europe/Moscow")).toContain("12");
  });

  it("метка зоны прикреплена всегда — у cron-уведомления нет зрителя", () => {
    const label = formatBillingDeadlineLabel(deadline, "Asia/Yekaterinburg");
    expect(label).toContain("Екатеринбург");
    expect(label).toContain("GMT+5");
  });

  it("московский кабинет тоже получает метку (иначе получатель не отличит источник)", () => {
    expect(formatBillingDeadlineLabel(deadline, "Europe/Moscow")).toMatch(/GMT\+3/);
  });

  it("отсутствие дедлайна даёт пустую строку, а не «Invalid Date»", () => {
    expect(formatBillingDeadlineLabel(null, "Europe/Moscow")).toBe("");
  });
});

describe("dateRU не используется на серверных путях (LOGIC-25)", () => {
  it("вызывающие ограничены клиентскими поверхностями", () => {
    const callers = walk(SRC_ROOT)
      .filter((file) => /\bdateRU\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"))
      .sort();

    // Список перечисляет тех, кому МОЖНО (идиома `MASTER_CRM_READERS`, SEC-29):
    // новый серверный вызывающий валит тест просто потому, что его здесь нет.
    expect(callers).toEqual([...VIEWER_TZ_ALLOWED].sort());
  });
});

/**
 * 29.09 доработки · 00-4 — та же ошибка шире `dateRU`: дата, отформатированная
 * НА СЕРВЕРЕ без `timeZone`, идёт по часам контейнера. Так жили «Доступ
 * сохранится до …» в уведомлении об отмене подписки (`admin-body-templates.ts`)
 * и дата «сегодня» в баннере кабинета студии (у студии в Екатеринбурге с 00:00
 * до 05:00 — вчерашний день).
 *
 * «Только серверный модуль» выводится из ГРАФА импортов, а не из имени файла:
 * модуль, не достижимый ни из одного `"use client"`, в браузер не попадает
 * (`lib/testing/client-graph.ts`, тот же обход, что у PERF-11). Баннер студии —
 * серверный компонент без `server-only` и без `/server/` в пути, признаки по
 * имени его не видели бы. Модули клиентского графа сюда не входят: там
 * viewer-tz бывает осознанным выбором, и это отдельный вопрос.
 *
 * Реестр — посайтовый (путь + вызов), идиома «кому МОЖНО»: новый серверный
 * вызов без пояса валит тест, пока его не впишут сюда с причиной.
 *
 * @probe 2026-09-29 — в `studio-today-banner.tsx` из `toLocaleDateString` убран
 * `timeZone`: покраснел «серверные модули форматируют дату с поясом» — лишний
 * сайт `studio-today-banner.tsx :: .toLocaleDateString("ru-RU", { weekday: …})`.
 * Возвращено — зелёный.
 * @probe 2026-09-29 — правдоподобная форма: опции вынесены в константу
 * без `timeZone` (`const OPTS = {…}; now.toLocaleDateString("ru-RU", OPTS)`) в
 * `admin-body-templates.ts`: покраснел тот же тест (сайт с аргументом `OPTS`).
 * Возвращено — зелёный.
 *
 * Слепые формы (осознанно): `timeZone: undefined` в аргументах засчитывается
 * как пояс; `date.toLocaleString()` без аргументов не отличить от числа
 * (`1500 .toLocaleString()`) и он пропускается; модули клиентского графа не
 * проверяются вовсе, хотя при SSR тоже исполняются на сервере.
 */
const SERVER_DATE_WITHOUT_TZ_ALLOWED: string[] = [];

const DATE_CALL = /(\.toLocaleDateString|\.toLocaleTimeString|\.toLocaleString|new Intl\.DateTimeFormat)\s*\(/g;
/** `toLocaleString` без полей даты — это форматирование ЧИСЛА (`1 500`). */
const DATE_OPTION_KEYS = /\b(day|month|year|hour|minute|weekday|dateStyle|timeStyle)\b/;

function callArguments(source: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return "";
}

function serverDateSitesWithoutTimeZone(): string[] {
  const { visited } = walkClientGraph();
  const sites: string[] = [];
  for (const file of listSourceFiles()) {
    if (visited.has(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(DATE_CALL)) {
      const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
      if (/\btimeZone\b/.test(args)) continue;
      if (match[1] === ".toLocaleString" && args.trim() !== "" && !DATE_OPTION_KEYS.test(args)) {
        continue;
      }
      if (match[1] === ".toLocaleString" && args.trim() === "") continue;
      const rel = relative(process.cwd(), file).split(sep).join("/");
      sites.push(`${rel} :: ${match[1]}(${args.replace(/\s+/g, " ").trim()})`);
    }
  }
  return sites.sort();
}

/**
 * 29.09 доработки · 24 — с переездом форматирования в `UI_FMT` пояс стал
 * обязательным аргументом, а «часы зрителя» — явным значением `VIEWER_TZ`.
 * В серверном модуле это то же «по часам контейнера», что и вызов без
 * `timeZone`, только спрятанное в общий хелпер, — поэтому сам идентификатор
 * в модулях вне клиентского графа запрещён.
 *
 * @probe 2026-10-01 — в `features/admin-cabinet/dashboard/server/kpis.service.ts`
 * (`server-only`) добавлено `UI_FMT.date(new Date(), "dayMonthShort", { timeZone: VIEWER_TZ })`:
 * покраснел «серверные модули не берут часы зрителя» — сайт
 * `src/features/admin-cabinet/dashboard/server/kpis.service.ts :: VIEWER_TZ`.
 * Возвращено — зелёный.
 */
function serverViewerTimeZoneSites(): string[] {
  const { visited } = walkClientGraph();
  const sites: string[] = [];
  for (const file of listSourceFiles()) {
    if (visited.has(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    if (/\bVIEWER_TZ\b/.test(source)) {
      sites.push(`${relative(process.cwd(), file).split(sep).join("/")} :: VIEWER_TZ`);
    }
  }
  return sites.sort();
}

describe("серверные модули форматируют дату с поясом (rule 17)", () => {
  it("серверные модули не берут часы зрителя (VIEWER_TZ)", () => {
    expect(serverViewerTimeZoneSites()).toEqual([]);
  }, 30_000);

  it("серверные модули форматируют дату с поясом", () => {
    expect(serverDateSitesWithoutTimeZone()).toEqual([...SERVER_DATE_WITHOUT_TZ_ALLOWED].sort());
    // Обход всего графа импортов (как у PERF-11) — под нагрузкой дольше 5 с.
  }, 30_000);
});
