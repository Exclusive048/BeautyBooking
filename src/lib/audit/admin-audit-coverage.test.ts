import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { AdminAuditAction } from "@prisma/client";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { parseSource } from "@/lib/testing/prisma-calls";
import { exportedHandlerMethods } from "@/lib/testing/route-handlers";

/**
 * ADMIN-AUDIT-COVERAGE (SECURITY-EXPOSURE-AUDIT-01 · Y14) — каждый мутирующий
 * обработчик файлов `route.ts` под `src/app/api/admin` пишет строку
 * `AdminAuditLog` (инв. #18/#19) либо стоит в посайтовом исключении с причиной.
 *
 * Пробел был реальным: из 31 мутирующего обработчика админки (на 2026-10-30)
 * шесть живых меняли данные или внешнее состояние без аудита (создание
 * категории, ручной запуск горящих окошек, очистка медиа, повтор и удаление
 * задачи dead-letter, переиндексация поиска по фото), а легаси `PATCH`/`DELETE`
 * отзывов ещё и удаляли отзыв мимо аудита и уведомления (выведены в 410).
 * Список в находке Y14 вели руками — сторож выводит его из дерева.
 *
 * ## Семья — по дереву, проверка — по свойству
 *
 * Семья: экспортированный обработчик `POST | PUT | PATCH | DELETE` любого
 * `route.ts` под `src/app/api/admin` — в любой из трёх форм объявления
 * (`export async function`, `export const X = …`, `export { h as X }`), и её
 * набор сверяется с `lib/testing/route-handlers.ts` (FIX-C7: форма объявления
 * не должна решать, попал ли обработчик в проверку).
 *
 * Свойство: обработчик ДОСТИГАЕТ вызова писателя аудита — `createAdminAuditLog`
 * или `createAdminAuditLogSafe`, ОПРЕДЕЛЁННОГО в `lib/audit/admin-audit.ts`.
 * Достижимость считается разбором компилятором, а не регекспом:
 *   - по вызовам и по функциям, переданным значением (`withX(handler)`);
 *   - через функции того же файла и через импорты в другие модули `src/`
 *     (`@/…` и относительные; переименование при импорте, `import * as ns`,
 *     переэкспорт `export { x } from` и `export *`) — сервисы админки пишут
 *     аудит в своей транзакции, роут его только вызывает;
 *   - писатель узнаётся по МОДУЛЮ-источнику, а не по имени: локальная функция
 *     с именем `createAdminAuditLog` не засчитывается, `import { … as audit }`
 *     засчитывается (инв. #43, «имя вместо свойства»).
 * Аудит в соседней функции файла, до которой обработчик не дотягивается, не
 * засчитывается — проверка по месту, а не по файлу.
 *
 * Слепые формы (названы): вызов через метод объекта, не являющегося импортом
 * пространства имён (`service.run()` у экземпляра); функция, полученная из
 * функции другого модуля; динамический `import()`. Сторож не проверяет, ЧТО
 * аудит стоит в той же транзакции, что мутация (#18 против #19) — только что
 * он есть на пути обработчика.
 *
 * ## Исключения — посайтовые, и сами проверяются
 *   - `retired` — обработчик выведен в 410: обязан звать ответ с литералом `410`;
 *   - `awaiting-enum` — нужного значения `AdminAuditAction` ещё нет (новое
 *     значение — это миграция). Исключение краснеет, как только значение
 *     появляется в схеме: миграция и запись аудита идут одним изменением.
 * Исключение, обработчик которого уже пишет аудит или исчез, — протухшее.
 *
 * @probe 2026-10-30 (ADMIN-AUDIT-ACTIONS-COVERAGE) — миграция добавила шесть
 *        значений, а аудит очереди ещё не был записан и исключения стояли.
 *        Наблюдалось: «значение AdminAuditAction.QUEUE_JOB_RETRIED уже в схеме —
 *        запишите аудит в src/app/api/admin/queue/[index]/route.ts#PATCH и
 *        снимите исключение». Аудит записан, исключения сняты — зелёный.
 * @probe 2026-10-30 — `cities/route.ts` POST: убран вызов `createAdminAuditLog`
 *        из транзакции. Наблюдалось: «мутирующий обработчик админки без
 *        AdminAuditLog: src/app/api/admin/cities/route.ts#POST». Возвращено — зелёный.
 * @probe 2026-10-30 — правдоподобная форма: тот же вызов вынесен в функцию
 *        `auditCityCreated` того же файла, которую POST НЕ зовёт (её зовёт
 *        только новый экспорт `auditForMerge`, а в POST осталось `void
 *        auditCityCreated`). Красный тем же текстом — аудит в соседней функции
 *        файла не засчитан. Тот же вынос с вызовом из POST — зелёный.
 * @probe 2026-10-30 — `import { createAdminAuditLog as audit }` в
 *        `cities/[id]/route.ts` с вызовами `audit(…)` — зелёный (писатель узнан
 *        по модулю); локальная `async function createAdminAuditLog() {}` в том
 *        же файле вместо импорта — красный: «…без AdminAuditLog:
 *        src/app/api/admin/cities/[id]/route.ts#PATCH, …#DELETE» плюс красный
 *        контроль невакуумности (`cities/[id]#DELETE`).
 * @probe 2026-10-30 — новый роут `src/app/api/admin/probe-x/route.ts` с
 *        `export const POST = async () => { … deleteMany … }` без аудита —
 *        красный «…без AdminAuditLog: src/app/api/admin/probe-x/route.ts#POST».
 * @probe 2026-10-30 — `reviews/[id]/route.ts` (исключение `retired`): `410`
 *        в PATCH заменён на `200` — красный «исключение retired, но обработчик
 *        не отвечает 410: src/app/api/admin/reviews/[id]/route.ts#PATCH».
 *        Возвращено — зелёный.
 * Те же формы закреплены синтетическими модулями ниже («машинерия»), чтобы
 * сторож не потерял их молча.
 */

const ROOT = process.cwd();
const ADMIN_API_DIR = "src/app/api/admin";
const AUDIT_MODULE = "src/lib/audit/admin-audit.ts";
const AUDIT_WRITERS = new Set(["createAdminAuditLog", "createAdminAuditLogSafe"]);
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

// ─── Разбор модулей ──────────────────────────────────────────────────────────

/** Источник модуля по пути от корня (posix); `null` — файла нет. */
type Loader = (file: string) => string | null;

type Binding = { file: string; name: string };

type ModuleInfo = {
  /** Локальные объявления верхнего уровня: тело функции либо инициализатор. */
  decls: Map<string, ts.Node>;
  /** Локальное имя импорта → модуль и имя экспорта в нём. */
  imports: Map<string, Binding>;
  /** `import * as ns` → модуль. */
  namespaces: Map<string, string>;
  /** `export { local as exported }` без источника: exported → local. */
  exportAliases: Map<string, string>;
  /** `export { a as b } from "…"`: b → модуль и a. */
  reexports: Map<string, Binding>;
  /** `export * from "…"`. */
  starReexports: string[];
  /** Имена, экспортированные модулем (объявления, алиасы, переэкспорты). */
  exported: Set<string>;
};

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.getModifiers(node as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function createAnalyzer(load: Loader) {
  const cache = new Map<string, ModuleInfo | null>();

  function resolveSpecifier(from: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith("./") || spec.startsWith("../")) base = posix.normalize(posix.join(posix.dirname(from), spec));
    else return null; // внешний пакет — не наш код
    const candidates = /\.(ts|tsx)$/.test(base)
      ? [base]
      : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    return candidates.find((candidate) => load(candidate) !== null) ?? null;
  }

  function moduleOf(file: string): ModuleInfo | null {
    if (cache.has(file)) return cache.get(file) ?? null;
    const text = load(file);
    if (text === null) {
      cache.set(file, null);
      return null;
    }
    const sf = parseSource(file, text);
    const info: ModuleInfo = {
      decls: new Map(),
      imports: new Map(),
      namespaces: new Map(),
      exportAliases: new Map(),
      reexports: new Map(),
      starReexports: [],
      exported: new Set(),
    };

    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name && st.body) {
        info.decls.set(st.name.text, st.body);
        if (hasExportModifier(st)) info.exported.add(st.name.text);
      } else if (ts.isVariableStatement(st)) {
        for (const decl of st.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          info.decls.set(decl.name.text, decl.initializer);
          if (hasExportModifier(st)) info.exported.add(decl.name.text);
        }
      } else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const clause = st.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const source = resolveSpecifier(file, st.moduleSpecifier.text);
        if (!source) continue;
        if (clause.name) info.imports.set(clause.name.text, { file: source, name: "default" });
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) info.namespaces.set(named.name.text, source);
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) {
            if (el.isTypeOnly) continue;
            info.imports.set(el.name.text, { file: source, name: (el.propertyName ?? el.name).text });
          }
        }
      } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
        const source =
          st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
            ? resolveSpecifier(file, st.moduleSpecifier.text)
            : null;
        if (!st.exportClause) {
          if (source) info.starReexports.push(source);
          continue;
        }
        if (!ts.isNamedExports(st.exportClause)) continue;
        for (const el of st.exportClause.elements) {
          const exportedName = el.name.text;
          const innerName = (el.propertyName ?? el.name).text;
          info.exported.add(exportedName);
          if (st.moduleSpecifier) {
            if (source) info.reexports.set(exportedName, { file: source, name: innerName });
          } else {
            info.exportAliases.set(exportedName, innerName);
          }
        }
      }
    }

    cache.set(file, info);
    return info;
  }

  /** Имена, на которые тело ссылается вызовом или передачей функции значением. */
  function referencesOf(body: ts.Node, mod: ModuleInfo): Array<{ kind: "local"; name: string } | { kind: "ns"; file: string; name: string }> {
    const out: Array<{ kind: "local"; name: string } | { kind: "ns"; file: string; name: string }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) out.push({ kind: "local", name: callee.text });
        if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
          const nsFile = mod.namespaces.get(callee.expression.text);
          if (nsFile) out.push({ kind: "ns", file: nsFile, name: callee.name.text });
        }
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg)) out.push({ kind: "local", name: arg.text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return out;
  }

  /** Доходит ли локальное имя модуля до писателя аудита. */
  function reachLocal(file: string, name: string, seen: Set<string>): boolean {
    const key = `${file}#local:${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const mod = moduleOf(file);
    if (!mod) return false;
    const body = mod.decls.get(name);
    if (body) {
      for (const ref of referencesOf(body, mod)) {
        const hit = ref.kind === "ns" ? reachExport(ref.file, ref.name, seen) : reachLocal(file, ref.name, seen);
        if (hit) return true;
      }
      return false;
    }
    const imported = mod.imports.get(name);
    if (imported) return reachExport(imported.file, imported.name, seen);
    return false;
  }

  /** Доходит ли экспорт `name` модуля `file` до писателя аудита. */
  function reachExport(file: string, name: string, seen: Set<string>): boolean {
    if (file === AUDIT_MODULE && AUDIT_WRITERS.has(name)) return true;
    const key = `${file}#export:${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const mod = moduleOf(file);
    if (!mod) return false;
    const alias = mod.exportAliases.get(name);
    if (alias) return reachLocal(file, alias, seen);
    if (mod.decls.has(name) || mod.imports.has(name)) return reachLocal(file, name, seen);
    const re = mod.reexports.get(name);
    if (re) return reachExport(re.file, re.name, seen);
    return mod.starReexports.some((star) => reachExport(star, name, seen));
  }

  /** Мутирующие методы, экспортированные файлом роута (по AST). */
  function mutatingHandlers(file: string): string[] {
    const mod = moduleOf(file);
    if (!mod) return [];
    return MUTATING_METHODS.filter((method) => mod.exported.has(method));
  }

  /** Отвечает ли обработчик 410: в его теле есть вызов с литералом `410`. */
  function answers410(file: string, method: string): boolean {
    const mod = moduleOf(file);
    if (!mod) return false;
    const body = mod.decls.get(mod.exportAliases.get(method) ?? method);
    if (!body) return false;
    let found = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.arguments.some((arg) => ts.isNumericLiteral(arg) && arg.text === "410")
      ) {
        found = true;
      }
      if (!found) ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  }

  return {
    reaches: (file: string, method: string) => reachExport(file, method, new Set()),
    mutatingHandlers,
    answers410,
  };
}

// ─── Дерево проекта ──────────────────────────────────────────────────────────

const diskLoader: Loader = (file) => {
  try {
    return readFileSync(join(ROOT, file), "utf8");
  } catch {
    return null;
  }
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...routeFiles(rel));
    else if (name === "route.ts") out.push(relative(ROOT, join(ROOT, rel)).split(sep).join("/"));
  }
  return out.sort();
}

type Exemption =
  | { kind: "retired"; reason: string }
  | { kind: "awaiting-enum"; action: string; reason: string };

const retired = (reason: string): Exemption => ({ kind: "retired", reason });
// Новое исключение «ждёт значения»: `{ kind: "awaiting-enum", action, reason }`.

/**
 * Посайтовые исключения `файл#МЕТОД`. Не «файл целиком»: соседний обработчик
 * того же файла проверяется как обычно.
 */
const EXEMPT: Record<string, Exemption> = {
  "src/app/api/admin/billing/route.ts#POST": retired("FIX-LEGACY-BILLING-ROUTE-01: создание тарифа — через сид"),
  "src/app/api/admin/billing/route.ts#PATCH": retired("FIX-LEGACY-BILLING-ROUTE-01: правка — /api/admin/billing/plans/[id] с аудитом"),
  "src/app/api/admin/catalog/route.ts#PATCH": retired("правка категорий — /api/admin/catalog/categories/[id] с аудитом CATEGORY_EDITED"),
  "src/app/api/admin/reviews/[id]/route.ts#PATCH": retired("ADMIN-AUDIT-COVERAGE: снять жалобу — /approve с аудитом REVIEW_APPROVED"),
  "src/app/api/admin/reviews/[id]/route.ts#DELETE": retired("ADMIN-AUDIT-COVERAGE: удалить отзыв — /delete с аудитом REVIEW_DELETED"),

};

const real = createAnalyzer(diskLoader);
const routes = routeFiles(ADMIN_API_DIR);
const family = routes.flatMap((file) =>
  real.mutatingHandlers(file).map((method) => ({
    site: `${file}#${method}`,
    file,
    method,
    audited: real.reaches(file, method),
  })),
);

describe("аудит админских мутаций — полнота (инв. #18/#19)", () => {
  it("семья выведена из дерева и совпадает с разбором методов роутов", () => {
    expect(routes.length).toBeGreaterThan(20);
    for (const file of routes) {
      const byRegex = exportedHandlerMethods(diskLoader(file) ?? "").filter((m) =>
        (MUTATING_METHODS as readonly string[]).includes(m),
      );
      expect(real.mutatingHandlers(file), file).toEqual(byRegex);
    }
    expect(family.length).toBeGreaterThan(20);
  });

  it("машинерия не вакуумна: аудит находится напрямую, через сервис и через два модуля", () => {
    const audited = new Set(family.filter((f) => f.audited).map((f) => f.site));
    for (const expected of [
      // прямой вызов в транзакции роута
      "src/app/api/admin/cities/[id]/route.ts#DELETE",
      // сервис другого модуля
      "src/app/api/admin/users/[id]/plan/route.ts#PATCH",
      "src/app/api/admin/vk-community/route.ts#PUT",
      // роут → decision-route.ts → reports.service.ts
      "src/app/api/admin/reports/[id]/resolve/route.ts#POST",
    ]) {
      expect(audited.has(expected), expected).toBe(true);
    }
  });

  it("каждый мутирующий обработчик админки пишет AdminAuditLog", () => {
    const missing = family.filter((f) => !f.audited && !(f.site in EXEMPT)).map((f) => f.site);
    expect(missing, `мутирующий обработчик админки без AdminAuditLog: ${missing.join(", ")}`).toEqual([]);
  });

  it("исключения не протухли", () => {
    const bySite = new Map(family.map((f) => [f.site, f]));
    const knownActions = new Set<string>(Object.values(AdminAuditAction));
    for (const [site, exemption] of Object.entries(EXEMPT)) {
      const entry = bySite.get(site);
      expect(entry, `исключение для несуществующего обработчика: ${site}`).toBeDefined();
      if (!entry) continue;
      expect(entry.audited, `обработчик уже пишет аудит — снимите исключение: ${site}`).toBe(false);
      if (exemption.kind === "retired") {
        expect(real.answers410(entry.file, entry.method), `исключение retired, но обработчик не отвечает 410: ${site}`).toBe(true);
      } else {
        expect(
          knownActions.has(exemption.action),
          `значение AdminAuditAction.${exemption.action} уже в схеме — запишите аудит в ${site} и снимите исключение`,
        ).toBe(false);
      }
    }
  });
});

// ─── Машинерия на синтетических модулях ──────────────────────────────────────

const AUDIT_STUB = `export async function createAdminAuditLog(input: unknown) { return input; }
export async function createAdminAuditLogSafe(input: unknown) { return createAdminAuditLog(input); }`;

function fixture(files: Record<string, string>) {
  const all: Record<string, string> = { [AUDIT_MODULE]: AUDIT_STUB, ...files };
  return createAnalyzer((file) => all[file] ?? null);
}

const ROUTE = "src/app/api/admin/fixture/route.ts";

describe("сторож аудита — машинерия", () => {
  it("аудит в соседней функции файла, до которой обработчик не дотягивается, не засчитан", () => {
    const a = fixture({
      [ROUTE]: `
        import { createAdminAuditLog } from "@/lib/audit/admin-audit";
        async function auditCreated() { await createAdminAuditLog({}); }
        export async function auditForMerge() { await auditCreated(); }
        export async function GET() { await createAdminAuditLog({}); }
        export async function POST() { return 1; }
        export async function PATCH() { await auditCreated(); }`,
    });
    expect(a.reaches(ROUTE, "POST")).toBe(false);
    expect(a.reaches(ROUTE, "PATCH")).toBe(true);
  });

  it("форма объявления не решает: export const и export { h as X }", () => {
    const a = fixture({
      [ROUTE]: `
        import { createAdminAuditLogSafe } from "@/lib/audit/admin-audit";
        async function handler() { await createAdminAuditLogSafe({}); }
        export const POST = async () => 1;
        export const PATCH = async () => { await createAdminAuditLogSafe({}); };
        export { handler as DELETE };`,
    });
    expect(a.mutatingHandlers(ROUTE)).toEqual(["POST", "PATCH", "DELETE"]);
    expect(a.reaches(ROUTE, "POST")).toBe(false);
    expect(a.reaches(ROUTE, "PATCH")).toBe(true);
    expect(a.reaches(ROUTE, "DELETE")).toBe(true);
  });

  it("обёртка: функция, переданная значением, считается достигнутой", () => {
    const a = fixture({
      [ROUTE]: `
        import { createAdminAuditLog } from "@/lib/audit/admin-audit";
        import { withAdmin } from "@/lib/fixture/with-admin";
        async function handler() { await createAdminAuditLog({}); }
        export const POST = withAdmin(handler);`,
      "src/lib/fixture/with-admin.ts": `export function withAdmin(h: () => unknown) { return h; }`,
    });
    expect(a.reaches(ROUTE, "POST")).toBe(true);
  });

  it("писатель узнаётся по модулю: переименование при импорте засчитано, тёзка — нет", () => {
    const aliased = fixture({
      [ROUTE]: `
        import { createAdminAuditLog as audit } from "@/lib/audit/admin-audit";
        export async function POST() { await audit({}); }`,
    });
    expect(aliased.reaches(ROUTE, "POST")).toBe(true);

    const namesake = fixture({
      [ROUTE]: `
        async function createAdminAuditLog(_input: unknown) { return null; }
        export async function POST() { await createAdminAuditLog({}); }`,
    });
    expect(namesake.reaches(ROUTE, "POST")).toBe(false);
  });

  it("упоминание в комментарии и строке не засчитано", () => {
    const a = fixture({
      [ROUTE]: `
        export async function POST() {
          // await createAdminAuditLog({ tx, action: "X" });
          return "createAdminAuditLog(";
        }`,
    });
    expect(a.reaches(ROUTE, "POST")).toBe(false);
  });

  it("через сервисы других модулей: относительный импорт, переэкспорт, пространство имён", () => {
    const a = fixture({
      [ROUTE]: `
        import { decide } from "@/features/fixture/decision-route";
        import * as ops from "@/lib/fixture/ops";
        export async function POST() { return decide(); }
        export async function DELETE() { return ops.purge(); }
        export async function PATCH() { return ops.untracked(); }`,
      "src/features/fixture/decision-route.ts": `
        import { decideReport } from "./index";
        export async function decide() { return decideReport(); }`,
      "src/features/fixture/index.ts": `export { decideReport } from "./reports.service";`,
      "src/features/fixture/reports.service.ts": `
        import { createAdminAuditLog } from "@/lib/audit/admin-audit";
        export async function decideReport() {
          await prisma.$transaction(async (tx) => { await createAdminAuditLog({ tx }); });
        }`,
      "src/lib/fixture/ops.ts": `
        export * from "./ops-impl";
        export async function untracked() { return 0; }`,
      "src/lib/fixture/ops-impl.ts": `
        import { createAdminAuditLogSafe } from "../audit/admin-audit";
        export async function purge() { await createAdminAuditLogSafe({}); }`,
    });
    expect(a.reaches(ROUTE, "POST")).toBe(true);
    expect(a.reaches(ROUTE, "DELETE")).toBe(true);
    expect(a.reaches(ROUTE, "PATCH")).toBe(false);
  });

  it("410 узнаётся по литералу в вызове ответа", () => {
    const a = fixture({
      [ROUTE]: `
        export async function PATCH() { return fail("Выведен", 410, "ENDPOINT_RETIRED"); }
        export async function DELETE() { return fail("Выведен", 200, "ENDPOINT_RETIRED"); }`,
    });
    expect(a.answers410(ROUTE, "PATCH")).toBe(true);
    expect(a.answers410(ROUTE, "DELETE")).toBe(false);
  });
});
