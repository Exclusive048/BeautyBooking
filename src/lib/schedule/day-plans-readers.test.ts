import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — таблицы расписания читает только модуль
 * расписания.
 *
 * Дашборд мастера, дашборд студии, загрузка недели, аналитика, советник и
 * guard рабочих часов читали недельную таблицу сами — каждый со своей копией
 * правила «рабочий ли день», и ни один с «Особыми днями». С графиками по датам
 * (этап 2) такие копии стали бы неправдой целиком. Теперь вопрос «работает ли
 * профиль в эти дни» задаётся `loadDayPlans` (`lib/schedule/day-plans.ts`) —
 * тем же движком, что режет окошки.
 *
 * Сторож обходит дерево `src/` и требует, чтобы каждое обращение к таблицам
 * расписания (делегат Prisma или фильтр/выборка по связи) было внутри
 * `lib/schedule/` или в реестре ниже с причиной. Реестр перечисляет, КОМУ
 * можно, — новый читатель валит CI просто потому, что его здесь нет.
 *
 * @probe 2026-09-28: во временный `lib/master/__probe_schedule_reader.ts`
 * положено `prisma.weeklyScheduleDay.count({ where: {} })` — красное: файл в
 * списке нарушителей. Вторая проба: `where: { weeklyScheduleConfig: { days:
 * { some: {} } } }` (форма прежнего дашборда студии) — тоже красное.
 */

const SRC = join(process.cwd(), "src");

// SCHEDULE-PATTERNS-01 (этап 2): графики (`schedulePattern`, `schedulePatternDay`)
// — те же таблицы расписания и то же правило.
const SCHEDULE_TABLE_ACCESS =
  /\.(weeklyScheduleConfig|weeklyScheduleDay|scheduleOverride|scheduleTemplate|scheduleTemplateBreak|scheduleBreak|schedulePattern|schedulePatternDay)\b|\b(weeklyScheduleConfig|weeklyScheduleDays?|scheduleOverrides|scheduleTemplates|scheduleBreaks|schedulePatterns|patternDays)\s*:\s*(\{|true)/;

/** Кому можно трогать таблицы расписания вне `lib/schedule/`, и почему. */
const ALLOWED: Record<string, string> = {
  "lib/deletion/delete-master.ts": "удаление кабинета чистит расписание (карта диспозиций, инв. #38)",
  "lib/deletion/delete-studio.ts": "удаление студии чистит расписание мастеров (инв. #38)",
  "lib/deletion/provider-data-disposition.ts": "карта диспозиций называет связи по имени, не читает",
  "lib/studios/master-profile-split.ts": "копия расписания личного профиля в профиль в студии (STUDIO-MASTER-PROFILES)",
  "app/api/studios/[id]/masters/[masterId]/schedule/overrides/route.ts":
    "редактор студии: список «Особых дней» мастера для правки, не вывод рабочих дней",
  "lib/providers/catalog-visibility.ts":
    "SQL-условие каталога «есть расписание»: график с датой окончания, неделя — для профиля без графика (SCHEDULE-PATTERNS-01)",
};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(rel));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe("таблицы расписания читает только модуль расписания", () => {
  const offenders = listSourceFiles("")
    .filter((rel) => !rel.startsWith("lib/schedule/"))
    .filter((rel) => SCHEDULE_TABLE_ACCESS.test(readFileSync(join(SRC, rel), "utf8")));

  it("вне lib/schedule/ — только файлы из реестра", () => {
    expect(offenders.filter((rel) => !(rel in ALLOWED))).toEqual([]);
  });

  it("реестр не протух: каждый его файл действительно обращается к таблицам", () => {
    // Иначе запись переживёт своего читателя и будет молча разрешать новый.
    expect(Object.keys(ALLOWED).filter((rel) => !offenders.includes(rel))).toEqual([]);
  });
});
