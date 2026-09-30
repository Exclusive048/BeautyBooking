import ts from "typescript";
import {
  calleeName,
  findInitializer,
  hasMark,
  objectProperties,
  resolveObjects,
  type PrismaCallSite,
  type PropertyView,
} from "@/lib/testing/prisma-calls";

/**
 * 29.09 доработки · 14 — правила двух сторожей записи броней поверх
 * `prisma-calls.ts`. Вынесены из тестов, чтобы их делили сторожа и инвентарь
 * `scripts/inventory-booking-guards.ts`.
 */

export const STATUS_WRITE_MARK = "booking-status-write-ok";
export const CONFLICT_SCOPE_MARK = "conflict-scope-ok";

const WRITE_METHODS = new Set(["update", "updateMany", "upsert"]);
const WINDOW_READ_METHODS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count"]);
const SCOPE_BUILDERS = new Set(["buildConflictScopeWhere", "buildOccupancyBookingWhere"]);

function prop(props: PropertyView[], name: string): PropertyView | undefined {
  return props.find((p) => p.name === name);
}

/**
 * Что запись делает со статусом брони:
 * - `null` — это не запись (`update | updateMany | upsert`);
 * - `"clean"` — `data` разрешена до литералов, ключа `status` нет;
 * - `"status"` — пишет `status`;
 * - `"unresolved: …"` — разобрать не удалось (параметр, вызов, спред неизвестного).
 */
export function bookingStatusWrite(site: PrismaCallSite): string | null {
  const verdict = dataKeyWrite(site, "status");
  return verdict === "writes" ? "status" : verdict;
}

/**
 * Пишет ли запись (`update | updateMany | upsert`) ключ `key` в `data` (у
 * `upsert` — в `update` и `create`):
 * - `null` — это не запись; `"clean"` — `data` разрешена до литералов, ключа нет;
 * - `"writes"` — пишет; `"unresolved: …"` — разобрать не удалось.
 * Общее правило сторожей «поле X пишет только Y» (статус брони, `deletedAt`
 * медиа — 29.09 доработки · 14, 16).
 */
export function dataKeyWrite(site: PrismaCallSite, key: string): string | null {
  if (!WRITE_METHODS.has(site.method)) return null;
  const args = site.arg ? resolveObjects(site.arg) : null;
  if (!args) return "unresolved: аргумент не разрешается до литерала";
  const keys = site.method === "upsert" ? ["update", "create"] : ["data"];
  let verdict = "clean";
  for (const arg of args) {
    const props = objectProperties(arg);
    if (props.some((p) => p.unresolvedSpread)) return "unresolved: спред неизвестного в аргументе";
    for (const part of keys) {
      const data = prop(props, part);
      if (!data?.value) return `unresolved: нет ${part}`;
      const objects = resolveObjects(data.value);
      if (!objects) return `unresolved: ${part} не разрешается до литерала`;
      for (const obj of objects) {
        const dataProps = objectProperties(obj);
        if (dataProps.some((p) => p.unresolvedSpread)) return `unresolved: спред неизвестного в ${part}`;
        if (dataProps.some((p) => p.name === null)) return `unresolved: вычисляемый ключ в ${part}`;
        if (prop(dataProps, key)) verdict = "writes";
      }
    }
  }
  return verdict;
}

/** Свойства `where` с развёрнутыми `AND: [ … ]` из литералов. */
function whereProperties(obj: ts.ObjectLiteralExpression): PropertyView[] {
  const props = objectProperties(obj);
  const out = [...props];
  const and = prop(props, "AND");
  if (and?.value) {
    const value = and.value;
    const items = ts.isArrayLiteralExpression(value) ? value.elements : [value];
    for (const item of items) {
      const objects = ts.isExpression(item) ? resolveObjects(item) : null;
      if (objects) for (const o of objects) out.push(...objectProperties(o));
    }
  }
  return out;
}

function spreadBuilder(p: PropertyView): string | null {
  const expr = p.unresolvedSpread;
  if (!expr) return null;
  const direct = calleeName(expr);
  if (direct) return direct;
  if (ts.isIdentifier(expr)) {
    const init = findInitializer(expr);
    return init ? calleeName(init) : null;
  }
  return null;
}

function hasBound(value: ts.Expression | null, keys: string[]): boolean {
  if (!value) return false;
  const objects = resolveObjects(value);
  if (!objects) return false;
  return objects.every((o) => objectProperties(o).some((p) => p.name !== null && keys.includes(p.name)));
}

/**
 * Строители окна пересечения — функции, чей `return` отдаёт объект с парой
 * `startAtUtc: { lt|lte }` + `endAtUtc: { gt|gte }`. Выводятся из дерева по
 * СВОЙСТВУ, а не списком имён (GUARD-INTEGRITY правило 4): сегодня это
 * `buildConflictWindowWhere` и `buildBookingOverlapWhere`, завтрашний третий
 * попадёт сам.
 */
export function windowBuilderNames(sourceFiles: ts.SourceFile[]): Set<string> {
  const names = new Set<string>();
  const returnsWindow = (body: ts.Node): boolean => {
    let found = false;
    const visit = (node: ts.Node) => {
      if (found) return;
      if (node !== body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) {
        const objects = resolveObjects(node.expression);
        if (objects?.some((o) => pairWindow(objectProperties(o)))) found = true;
      }
      ts.forEachChild(node, visit);
    };
    if (ts.isExpression(body)) {
      const objects = resolveObjects(body);
      return Boolean(objects?.some((o) => pairWindow(objectProperties(o))));
    }
    visit(body);
    return found;
  };
  for (const sf of sourceFiles) {
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body && returnsWindow(node.body)) {
        names.add(node.name.text);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        returnsWindow(node.initializer.body)
      ) {
        names.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

function pairWindow(props: PropertyView[]): boolean {
  const start = prop(props, "startAtUtc");
  const end = prop(props, "endAtUtc");
  return hasBound(start?.value ?? null, ["lt", "lte"]) && hasBound(end?.value ?? null, ["gt", "gte"]);
}

function hasWindow(props: PropertyView[], windowBuilders: ReadonlySet<string>): boolean {
  if (props.some((p) => {
    const b = spreadBuilder(p);
    return b !== null && windowBuilders.has(b);
  })) return true;
  return pairWindow(props);
}

/**
 * Скоуп чтения броней с окном пересечения:
 * - `null` — чтение не из семьи (не чтение или без окна пересечения);
 * - `"scope:<билдер>"` — скоуп взят из общего билдера в том же `where`;
 * - `"mark"` — отметка `// conflict-scope-ok: <причина>` на инструкции;
 * - `"MISSING"` — окно есть, скоупа из билдера нет.
 */
export function conflictScopeOf(site: PrismaCallSite, windowBuilders: ReadonlySet<string>): string | null {
  if (!WINDOW_READ_METHODS.has(site.method)) return null;
  const args = site.arg ? resolveObjects(site.arg) : null;
  if (!args) return null;
  let inFamily = false;
  let scoped: string | null = null;
  let allScoped = true;
  for (const arg of args) {
    const where = prop(objectProperties(arg), "where");
    const whereObjects = where?.value ? resolveObjects(where.value) : null;
    if (!whereObjects) continue;
    for (const w of whereObjects) {
      const props = whereProperties(w);
      if (!hasWindow(props, windowBuilders)) continue;
      inFamily = true;
      const builder = props.map(spreadBuilder).find((b) => b && SCOPE_BUILDERS.has(b)) ?? null;
      if (builder) scoped = builder;
      else allScoped = false;
    }
  }
  if (!inFamily) return null;
  if (allScoped && scoped) return `scope:${scoped}`;
  if (hasMark(site.marks, CONFLICT_SCOPE_MARK)) return "mark";
  return "MISSING";
}
