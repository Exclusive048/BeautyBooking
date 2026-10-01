/**
 * «Функция дотягивается до вызова» — разбор компилятором для сторожей полноты,
 * у которых семья выводится по СВОЙСТВУ: экспортируемая функция, которая сама
 * или через функции того же файла зовёт `X(`, обязана так же дойти до `Y(`.
 *
 * Вынесено из `audit/pd-access-completeness.test.ts` (29.09 доработки · 16) для
 * второго потребителя — `crm/clients-window-coverage.test.ts` (· 31).
 *
 * Слепые формы (названы): вызов через другой модуль (функция-помощник из
 * чужого файла в граф не входит), вызов по свойству (`obj.fn(`), функция,
 * переданная значением.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

import { parseSource } from "@/lib/testing/prisma-calls";

const ROOT = process.cwd();

export type Fn = { name: string; exported: boolean; body: ts.Node };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Функции верхнего уровня файла: `function f()` и `const f = () => …`. */
export function functionsOf(sf: ts.SourceFile): Fn[] {
  const out: Fn[] = [];
  for (const st of sf.statements) {
    const exported = Boolean(ts.getModifiers(st as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    if (ts.isFunctionDeclaration(st) && st.name && st.body) out.push({ name: st.name.text, exported, body: st.body });
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          out.push({ name: d.name.text, exported, body: d.initializer.body });
        }
      }
    }
  }
  return out;
}

function calledNames(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}

/** Доходит ли `fn` до вызова `target` — сама или через функции того же файла. */
export function reaches(fn: Fn, target: string, byName: Map<string, Fn>, seen = new Set<string>()): boolean {
  if (seen.has(fn.name)) return false;
  seen.add(fn.name);
  const calls = calledNames(fn.body);
  if (calls.has(target)) return true;
  for (const name of calls) {
    const next = byName.get(name);
    if (next && reaches(next, target, byName, seen)) return true;
  }
  return false;
}

/**
 * Экспортируемые функции `src/`, дотягивающиеся до `source(`, — и дотягиваются
 * ли они до каждого из `targets`. Файл-определение `source` пропускается.
 */
export function exportedReachers(
  source: string,
  definedIn: string,
  targets: readonly string[],
): Array<{ site: string; reached: Record<string, boolean> }> {
  const out: Array<{ site: string; reached: Record<string, boolean> }> = [];
  for (const full of walk(join(ROOT, "src"))) {
    const text = readFileSync(full, "utf8");
    if (!text.includes(`${source}(`)) continue;
    const rel = relative(ROOT, full).split(sep).join("/");
    if (rel === definedIn) continue;
    const fns = functionsOf(parseSource(rel, text));
    const byName = new Map(fns.map((f) => [f.name, f]));
    for (const fn of fns.filter((f) => f.exported)) {
      if (!reaches(fn, source, byName)) continue;
      out.push({
        site: `${rel}#${fn.name}`,
        reached: Object.fromEntries(targets.map((t) => [t, reaches(fn, t, byName)])),
      });
    }
  }
  return out;
}
