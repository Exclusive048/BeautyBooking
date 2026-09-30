import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { buildConflictScopeWhere, buildConflictWindowWhere } from "@/lib/bookings/booking-core";
import { conflictScopeOf, windowBuilderNames } from "@/lib/testing/booking-guards";
import { parseSource, scanPrismaCalls, type PrismaCallSite } from "@/lib/testing/prisma-calls";

/**
 * LOGIC-01 — предикат конфликта ключевался ПАРОЙ `(providerId, masterProviderId)`,
 * а один и тот же мастер имеет брони под ДВУМЯ разными `providerId`:
 *
 *   личный профиль  → providerId = мастер,        masterProviderId = мастер
 *   студийный кабинет → providerId = студия,      masterProviderId = мастер
 *
 * Множества не пересекались, поэтому админ студии создавал бронь поверх
 * существующей БЕЗ гонки, а Serializable этого не ловил (транзакции читают
 * непересекающиеся строки — цикла зависимостей нет).
 *
 * Тест проверяет две вещи, которые ломаются независимо: (1) сам предикат
 * покрывает обе стороны и остаётся НАДМНОЖЕСТВОМ прежнего; (2) все места, где
 * конфликт ищется, действительно берут скоуп из общего билдера — иначе
 * следующая копия молча вернёт дефект.
 *
 * @probe   🔴 **FIX-C7 · RETRO-PROBE — у этого сторожа пробы НЕ БЫЛО ВООБЩЕ**
 *          (блока `@probe` в файле не существовало, хотя инв. #43 его требует).
 *          Проведена; выведенная проверка полноты оказалась
 *          WEAKER-THAN-CLAIMED. A/B, ШЕСТАЯ копия парного скоупа
 *          (`providerId` + `masterProviderId` рядом с фильтром активных броней
 *          плюс собственная арифметика `overlaps(`) в новом файле
 *          `lib/bookings/_probe-scope.ts`:
 *            · файл НЕ упоминает билдер                → 1 failed, файл назван;
 *            · тот же файл ДОПОЛНИТЕЛЬНО зовёт билдер
 *              в соседней функции (обычное чтение)     → **зелено**.
 *          То есть амнистия не исчезла, а переехала: раньше её давало
 *          файловое исключение (`usecases.ts`, LOGIC-01), теперь — наличие
 *          билдера где-нибудь в файле. Тот же класс, тот же файловый масштаб.
 *          ⚠️ Инв. #11 в `MASTERRYADOM_AI_CONTEXT.md` утверждал, что проверка
 *          требует формы ВЫЗОВА; в коде так было только для ЖЁСТКОГО СПИСКА из
 *          пяти файлов, а выведенная проверка смотрела на идентификатор.
 *          Починено здесь частично (идентификатор → форма вызова), что
 *          закрывает подслучай «файл только импортирует». Полный случай —
 *          посайтовая проверка, к какому именно запросу относится билдер, —
 *          регекспом не решается: заведено как `CONFLICT-SCOPE-PER-SITE`.
 *          Повторная проба после правки: файл, который билдер только
 *          импортирует и не зовёт → 1 failed.
 *
 *          29.09 доработки · 14 (CONFLICT-SCOPE-PER-SITE) — файловая проверка,
 *          `NON_CONFLICT_READERS`, признак `overlaps(` и жёсткий список пяти
 *          файлов заменены проверкой ПО МЕСТУ (блок «скоуп по месту» ниже).
 */

type ScopeWhere = { OR: Array<Record<string, unknown>> };

const MASTER = "provider-master";
const STUDIO = "provider-studio";
/** STUDIO-MASTER-PROFILES: профиль того же человека в студии. */
const MASTER_IN_STUDIO = "provider-master-in-studio";

function clauses(where: ScopeWhere): string[] {
  return where.OR.map((clause) => JSON.stringify(clause));
}

function performerClause(...ids: string[]): string {
  return JSON.stringify({ masterProviderId: { in: [...ids].sort() } });
}

describe("buildConflictScopeWhere — LOGIC-01", () => {
  it("бронь студии видит брони мастера с его личного профиля", () => {
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
      occupancyIds: [MASTER],
    }) as ScopeWhere;

    // ключ — исполнитель, а не пара; личная бронь имеет тот же masterProviderId
    expect(clauses(where)).toContain(performerClause(MASTER));
  });

  it("бронь с личного профиля видит брони того же мастера в студии", () => {
    const where = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
      occupancyIds: [MASTER],
    }) as ScopeWhere;

    expect(clauses(where)).toContain(performerClause(MASTER));
  });

  it("скоуп больше не привязан к providerId, под которым создана бронь", () => {
    const fromStudio = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
      occupancyIds: [MASTER],
    }) as ScopeWhere;
    const fromPersonal = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
      occupancyIds: [MASTER],
    }) as ScopeWhere;

    // обе стороны спрашивают об ОДНОМ ресурсе — времени мастера
    expect(clauses(fromStudio)).toEqual(clauses(fromPersonal));
  });

  it("бронь без назначенного мастера сохраняет ПРЕЖНИЙ широкий скоуп", () => {
    // сузить его — отдельное продуктовое решение, а не побочный эффект фикса
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: null,
      occupancyIds: [STUDIO],
    }) as ScopeWhere;

    expect(clauses(where)).toContain(JSON.stringify({ providerId: STUDIO }));
    expect(clauses(where)).toContain(
      JSON.stringify({ masterProviderId: null, providerId: { in: [STUDIO] } }),
    );
  });

  it("бронь мастера не конфликтует с бронями ЧУЖОГО мастера", () => {
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
      occupancyIds: [MASTER],
    }) as ScopeWhere;

    const serialized = JSON.stringify(where);
    expect(serialized).not.toContain("provider-other");
    // и не превращается в «все брони студии»
    expect(clauses(where)).not.toContain(JSON.stringify({ providerId: STUDIO }));
  });

  it("исполнитель входит в скоуп, даже если набор профилей его не назвал", () => {
    // набор приходит из БД; профиль без владельца резолвится в [себя], но
    // билдер не должен полагаться на то, что вызывающий это соблюл
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER,
      occupancyIds: [],
    }) as ScopeWhere;

    expect(clauses(where)).toContain(performerClause(MASTER));
  });
});

/**
 * STUDIO-MASTER-PROFILES (решение владельца 2026-09-27): у мастера может быть
 * личный профиль и профиль в студии — две единицы записи, но время у человека
 * одно. Занятое в одном профиле обязано быть недоступно в другом.
 */
describe("buildConflictScopeWhere — профили одного человека", () => {
  it("запись в студийный профиль видит записи личного профиля", () => {
    const where = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER_IN_STUDIO,
      occupancyIds: [MASTER, MASTER_IN_STUDIO],
    }) as ScopeWhere;

    expect(clauses(where)).toContain(performerClause(MASTER, MASTER_IN_STUDIO));
    // и соло-форму личного профиля (запись без назначенного мастера)
    expect(clauses(where)).toContain(
      JSON.stringify({ masterProviderId: null, providerId: { in: [MASTER, MASTER_IN_STUDIO].sort() } }),
    );
  });

  it("личная запись видит студийные записи того же человека", () => {
    const where = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
      occupancyIds: [MASTER, MASTER_IN_STUDIO],
    }) as ScopeWhere;

    expect(clauses(where)).toContain(performerClause(MASTER, MASTER_IN_STUDIO));
  });

  it("с какой стороны ни спросить — ресурс один и тот же", () => {
    const people = [MASTER, MASTER_IN_STUDIO];
    const fromStudio = buildConflictScopeWhere({
      providerId: STUDIO,
      masterProviderId: MASTER_IN_STUDIO,
      occupancyIds: people,
    }) as ScopeWhere;
    const fromPersonal = buildConflictScopeWhere({
      providerId: MASTER,
      masterProviderId: MASTER,
      occupancyIds: people,
    }) as ScopeWhere;

    expect(clauses(fromStudio)).toEqual(clauses(fromPersonal));
  });
});

/**
 * Вторая половина — скоуп ПО МЕСТУ (29.09 доработки · 14, CONFLICT-SCOPE-PER-SITE).
 *
 * Семья — чтение броней (`findMany | findFirst | findFirstOrThrow | count`),
 * чей `where` содержит окно пересечения: спред строителя окна или пару
 * `startAtUtc: { lt|lte }` + `endAtUtc: { gt|gte }`. Строители окна выводятся
 * из дерева по свойству (функция, чей `return` отдаёт такую пару), статус в
 * определение семьи НЕ входит — прежний признак `notIn: [...]` терял чтения со
 * статусом через константу (`model-offers-mutations.ts`).
 *
 * Каждый такой сайт обязан в ТОМ ЖЕ `where` брать скоуп из
 * `buildConflictScopeWhere(…)` / `buildOccupancyBookingWhere(…)` (напрямую или
 * константой из той же функции) либо нести `// conflict-scope-ok: <причина>` на
 * инструкции. До этого проверка была файловой: шестая копия парного скоупа
 * проходила, если тот же файл звал билдер в соседней функции (FIX-C7).
 *
 * Проверка пересечения ПЕРЕД ЗАПИСЬЮ — одна функция, `ensureNoConflicts`
 * (`booking-core.ts`): бывшие пять копий переведены на неё, и тест ниже держит
 * именно форму вызова.
 *
 * Слепые формы: `where`, собранный в другом модуле и переданный параметром
 * (не разрешается — сайт выпадает из семьи); сырой SQL; окно, записанное не
 * через `startAtUtc`/`endAtUtc` (например, по `proposedStartAt`).
 *
 * @probe 2026-09-29 — в `studio/bookings.service.ts` (файл зовёт
 *        `ensureNoConflicts`) добавлена шестая копия: соседняя функция с
 *        `tx.booking.findMany({ where: { providerId, masterProviderId, status:
 *        { notIn: [...] }, startAtUtc: { lt }, endAtUtc: { gt } } })` — красный
 *        «каждое чтение с окном пересечения берёт скоуп по месту» с этим сайтом
 *        (до правки — зелёный, FIX-C7); та же копия со статусом через константу
 *        (`status: { in: ACTIVE }`) — красный; снята отметка у соседей по пакету
 *        (`moveStudioBooking`) — красный; возвращено — зелёный.
 */
describe("скоуп конфликта — по месту чтения", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

  function walk(relDir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(resolve(PROJECT_ROOT, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(...walk(rel));
        continue;
      }
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  }

  const files = walk("src").map((rel) => ({ rel, text: readFileSync(resolve(PROJECT_ROOT, rel), "utf8") }));
  const windowBuilders = windowBuilderNames(
    files.filter((f) => f.text.includes("startAtUtc")).map((f) => parseSource(f.rel, f.text)),
  );
  const family = files
    .filter((f) => /booking\b/.test(f.text))
    .flatMap((f) => scanPrismaCalls(f.rel, f.text, "booking").calls)
    .map((site) => ({ site, scope: conflictScopeOf(site, windowBuilders) }))
    .filter((x): x is { site: PrismaCallSite; scope: string } => x.scope !== null);

  it("строители окна найдены, семья не пуста — иначе сторож вакуумный", () => {
    expect([...windowBuilders]).toEqual(expect.arrayContaining(["buildConflictWindowWhere", "buildBookingOverlapWhere"]));
    expect(family.length).toBeGreaterThanOrEqual(5);
    // единственная проверка перед записью — в семье и на билдере
    expect(
      family.some((x) => x.site.file === "src/lib/bookings/booking-core.ts" && x.scope === "scope:buildConflictScopeWhere"),
    ).toBe(true);
  });

  it("каждое чтение с окном пересечения берёт скоуп по месту", () => {
    const missing = family.filter((x) => x.scope === "MISSING").map((x) => `${x.site.file}:${x.site.line}`);
    expect(
      missing,
      `Чтение броней с окном пересечения без скоупа из buildConflictScopeWhere / buildOccupancyBookingWhere ` +
        `в том же where. Если это проверка конфликта — ensureNoConflicts (иначе вернётся LOGIC-01); ` +
        `если скоуп законно другой — отметка «// conflict-scope-ok: <причина>» на инструкции: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("проверка пересечения перед записью — одна функция на всех пяти бывших копиях", () => {
    for (const rel of [
      "src/lib/bookings/confirmBooking.ts",
      "src/lib/bookings/usecases.ts",
      "src/lib/studio/bookings.service.ts",
      "src/app/api/model-applications/[applicationId]/confirm/route.ts",
    ]) {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(source, rel).toContain("ensureNoConflicts(");
    }
    const conflictReads = family.filter(
      (x) => x.scope === "scope:buildConflictScopeWhere",
    );
    expect(conflictReads.map((x) => x.site.file)).toEqual(["src/lib/bookings/booking-core.ts"]);
  });
});

/**
 * LOGIC-17 — скоуп отвечает «чьё это время», окно — «за какой отрезок смотрим».
 * Второго не было вовсе у обоих студийных путей: `findMany` без `lt`/`gt`
 * забирает ВСЮ историю броней мастера. Помимо стоимости, внутри Serializable
 * это ставит predicate-lock на всю историю — параллельная запись брони того же
 * мастера, хоть на следующий год, становится кандидатом на P2034 и получает
 * ложный 409 `SLOT_CONFLICT`, и частота таких ложных конфликтов растёт линейно
 * с историей кабинета.
 *
 * Опасность сужения запроса — потерять конфликт. Поэтому тест сверяет предикат
 * БД с предикатом в памяти на границах: они обязаны отбирать одно и то же.
 */
describe("buildConflictWindowWhere — LOGIC-17", () => {
  const start = new Date("2026-08-12T10:00:00.000Z");
  const end = new Date("2026-08-12T11:00:00.000Z");

  /** Тот же расчёт, что делает `.some(...)` в studio/bookings.service.ts. */
  function overlapsInMemory(rowStart: Date, rowEnd: Date, bufferMin: number): boolean {
    const itemStart = bufferMin ? new Date(rowStart.getTime() - bufferMin * 60_000) : rowStart;
    const itemEnd = bufferMin ? new Date(rowEnd.getTime() + bufferMin * 60_000) : rowEnd;
    return start < itemEnd && end > itemStart;
  }

  function matchesWindow(rowStart: Date, rowEnd: Date, bufferMin: number): boolean {
    const where = buildConflictWindowWhere({ startAtUtc: start, endAtUtc: end, bufferMin });
    return rowStart < where.startAtUtc.lt && rowEnd > where.endAtUtc.gt;
  }

  const cases: Array<{ name: string; rowStart: string; rowEnd: string }> = [
    { name: "точно накрывает", rowStart: "2026-08-12T10:30:00Z", rowEnd: "2026-08-12T11:30:00Z" },
    { name: "встык до", rowStart: "2026-08-12T09:00:00Z", rowEnd: "2026-08-12T10:00:00Z" },
    { name: "встык после", rowStart: "2026-08-12T11:00:00Z", rowEnd: "2026-08-12T12:00:00Z" },
    { name: "за буфером до", rowStart: "2026-08-12T08:00:00Z", rowEnd: "2026-08-12T09:30:00Z" },
    { name: "за буфером после", rowStart: "2026-08-12T11:20:00Z", rowEnd: "2026-08-12T12:00:00Z" },
    { name: "далеко в прошлом", rowStart: "2025-01-01T10:00:00Z", rowEnd: "2025-01-01T11:00:00Z" },
    { name: "далеко в будущем", rowStart: "2027-01-01T10:00:00Z", rowEnd: "2027-01-01T11:00:00Z" },
  ];

  for (const bufferMin of [0, 15]) {
    for (const item of cases) {
      it(`${item.name} · буфер ${bufferMin} — БД и память согласны`, () => {
        const rowStart = new Date(item.rowStart);
        const rowEnd = new Date(item.rowEnd);
        expect(matchesWindow(rowStart, rowEnd, bufferMin)).toBe(
          overlapsInMemory(rowStart, rowEnd, bufferMin),
        );
      });
    }
  }

  it("история за пределами окна в выборку не попадает", () => {
    const where = buildConflictWindowWhere({ startAtUtc: start, endAtUtc: end, bufferMin: 0 });
    const lastYearStart = new Date("2025-01-01T10:00:00Z");
    const lastYearEnd = new Date("2025-01-01T11:00:00Z");
    expect(lastYearStart < where.startAtUtc.lt && lastYearEnd > where.endAtUtc.gt).toBe(false);
  });

  it("оба студийных пути идут через ensureNoConflicts — окно из билдера", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/studio/bookings.service.ts"),
      "utf8",
    );
    // Два вызова — create и move (29.09 доработки · 14: окно и скоуп внутри).
    expect(source.match(/ensureNoConflicts\(/g)?.length).toBe(2);
    // Прежняя безоконная форма не должна вернуться.
    expect(source).not.toMatch(/startAtUtc:\s*\{\s*not:\s*null\s*\},/);
  });
});
