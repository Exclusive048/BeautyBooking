/**
 * «Обработчик роута дотягивается до функции» — через ГРАНИЦЫ модулей.
 *
 * `function-reach.ts` идёт только по функциям одного файла: ему хватало, пока
 * семья жила в сервисе. Вопрос «из какого роута достижим `recordPdAccess`»
 * (CRM-MOBILE-FAIL-CLOSED) по одному файлу не решается: роут зовёт сервис из
 * `features/…`, сервис — помощник, и след пишет уже помощник. Здесь — граф по
 * импортам: `@/…` и относительные пути, именованные импорты (в том числе
 * переименованные — `import { a as b }`), пространства имён (`ns.fn(`),
 * переэкспорт (`export { a as b } from`, `export * from`).
 *
 * Ребро — не только ВЫЗОВ, но и любая ссылка на функцию по имени: функция,
 * переданная значением (`withAuth(handler)`, `.map(loadX)`), тоже достижима.
 * Это сознательно шире вызова: для сторожа «достижим ли след ПДн» ложное
 * «достижим» стоит одной записи в исключениях с причиной, ложное «нет» —
 * чувствительного роута, который сторож молча не увидел.
 *
 * Слепые формы (названы): метод объекта или класса (`service.list(`, где
 * `service` — объект, а не пространство имён импорта), динамический
 * `import()`, пакеты вне `src/`, `export default` (в путях до следа ПДн его
 * нет). Типовые импорты (`import type`) рёбер не дают.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import ts from "typescript";

import { parseSource } from "@/lib/testing/prisma-calls";

const ROOT = process.cwd();

export type SymbolRef = { module: string; name: string };

type ImportBinding = SymbolRef;

type ModuleInfo = {
  /** Верхнеуровневые функции и константы: имя → узел, по которому ищутся рёбра. */
  locals: Map<string, ts.Node>;
  /** Экспорт: имя снаружи → локальное имя или ссылка в другой модуль. */
  exports: Map<string, { local: string } | SymbolRef>;
  starExports: string[];
  imports: Map<string, ImportBinding>;
  namespaces: Map<string, string>;
};

const toRel = (full: string) => relative(ROOT, full).split(sep).join("/");

function isFile(full: string): boolean {
  return existsSync(full) && statSync(full).isFile();
}

/** Модуль проекта по спецификатору импорта; пакеты — `null`. */
export function resolveModule(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(ROOT, dirname(fromRel), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
    if (/\.(ts|tsx)$/.test(candidate) && isFile(candidate)) return toRel(candidate);
  }
  return null;
}

const hasExport = (node: ts.Node) =>
  Boolean(ts.getModifiers(node as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));

const moduleCache = new Map<string, ModuleInfo>();

function loadModule(rel: string): ModuleInfo {
  const cached = moduleCache.get(rel);
  if (cached) return cached;
  const info: ModuleInfo = {
    locals: new Map(),
    exports: new Map(),
    starExports: [],
    imports: new Map(),
    namespaces: new Map(),
  };
  moduleCache.set(rel, info);
  const sf = parseSource(rel, readFileSync(join(ROOT, rel), "utf8"));

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const target = resolveModule(rel, st.moduleSpecifier.text);
      if (!target) continue;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) info.namespaces.set(bindings.name.text, target);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (el.isTypeOnly) continue;
          info.imports.set(el.name.text, { module: target, name: (el.propertyName ?? el.name).text });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      const target =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? resolveModule(rel, st.moduleSpecifier.text)
          : null;
      if (st.moduleSpecifier && !target) continue;
      if (!st.exportClause) {
        if (target) info.starExports.push(target);
        continue;
      }
      if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const inner = (el.propertyName ?? el.name).text;
          info.exports.set(el.name.text, target ? { module: target, name: inner } : { local: inner });
        }
      }
      continue;
    }
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      info.locals.set(st.name.text, st.body);
      if (hasExport(st)) info.exports.set(st.name.text, { local: st.name.text });
      continue;
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        // Любой инициализатор, а не только стрелка: `export const GET =
        // withSomething(async () => …)` — обработчик внутри вызова.
        info.locals.set(d.name.text, d.initializer);
        if (hasExport(st)) info.exports.set(d.name.text, { local: d.name.text });
      }
    }
  }
  return info;
}

/** Где на самом деле живёт экспорт `name` модуля: модуль + локальное имя. */
export function resolveExport(module: string, name: string, depth = 0): SymbolRef | null {
  if (depth > 20) return null;
  const info = loadModule(module);
  const entry = info.exports.get(name);
  if (entry && "local" in entry) {
    if (info.locals.has(entry.local)) return { module, name: entry.local };
    const imported = info.imports.get(entry.local);
    return imported ? resolveExport(imported.module, imported.name, depth + 1) : null;
  }
  if (entry) return resolveExport(entry.module, entry.name, depth + 1);
  for (const star of info.starExports) {
    const found = resolveExport(star, name, depth + 1);
    if (found) return found;
  }
  return null;
}

const key = (ref: SymbolRef) => `${ref.module}#${ref.name}`;

const edgeCache = new Map<string, SymbolRef[]>();

/**
 * Рёбра символа: куда он ссылается. Импорт, ведущий прямо в цель, остаётся
 * ссылкой на (модуль, экспортное имя) — `resolveExport` вернул бы то же самое,
 * но цели с телом-переэкспортом иначе не нашлись бы.
 */
function edgesOf(ref: SymbolRef): SymbolRef[] {
  const cached = edgeCache.get(key(ref));
  if (cached) return cached;
  const info = loadModule(ref.module);
  const body = info.locals.get(ref.name);
  const out: SymbolRef[] = [];
  const add = (target: SymbolRef | null) => {
    if (target) out.push(target);
  };
  const viaImport = (binding: ImportBinding) => {
    out.push(binding);
    add(resolveExport(binding.module, binding.name));
  };
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const ns = info.namespaces.get(node.expression.text);
        if (ns) {
          viaImport({ module: ns, name: node.name.text });
          return;
        }
      }
      visit(node.expression);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      visit(node.initializer);
      return;
    }
    if (ts.isIdentifier(node)) {
      const text = node.text;
      if (info.locals.has(text)) add({ module: ref.module, name: text });
      else {
        const binding = info.imports.get(text);
        if (binding) viaImport(binding);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (body) visit(body);
  edgeCache.set(key(ref), out);
  return out;
}

/** Достижим ли `target` из `from` по ссылкам (обход в ширину, без памяти между корнями). */
export function symbolReaches(from: SymbolRef, target: SymbolRef): boolean {
  const goal = key(target);
  const seen = new Set<string>();
  const queue: SymbolRef[] = [from];
  while (queue.length > 0) {
    const next = queue.shift()!;
    const k = key(next);
    if (k === goal) return true;
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push(...edgesOf(next));
  }
  return false;
}

/** Все `route.ts` под каталогом (относительные пути от корня проекта). */
export function routeFiles(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (full: string) => {
    for (const name of readdirSync(full)) {
      const child = join(full, name);
      if (statSync(child).isDirectory()) walk(child);
      else if (name === "route.ts" || name === "route.tsx") out.push(toRel(child));
    }
  };
  walk(join(ROOT, dirRel));
  return out.sort();
}
