import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseSource } from "@/lib/testing/prisma-calls";

/**
 * 29.09 доработки · 16 (PD-ACCESS-ANOMALY-DETECTION, шаг В0) — каждая функция,
 * которая отдаёт список клиентов, пишет след `recordPdAccess`.
 *
 * Пробел был реальным: `master.clients.list` и `studio.clients.list` писали
 * только API-роуты списков, которые интерфейс не зовёт, а настоящие страницы
 * читали базу через SSR (`getMasterClientsView`, `loadStudioClientsData`) — и
 * след молчал. RKN-FIX-10 проверялся запросом прямо в API, поэтому пробел не
 * заметили; детектор аномалий на такой таблице ничего бы не увидел.
 *
 * Семья выводится по СВОЙСТВУ, а не списком: экспортируемая функция, которая
 * сама или через функции того же файла зовёт `groupBookings(` (сборка списка
 * клиентов из броней, `lib/crm/clients.ts`). Каждая такая функция обязана так
 * же дойти до `recordPdAccess(`. Исключения — посайтовые (файл#функция).
 *
 * Слепая форма: список собран не через `groupBookings` (своя группировка) или
 * помощник из другого модуля — такая функция в семью не попадёт.
 *
 * @probe 2026-09-29 — в `getMasterClientsView` (`lib/master/clients-view.service.ts`)
 *        вызов `recordPdAccess` заменён пустой функцией: красный «список клиентов без
 *        следа» с `clients-view.service.ts#getMasterClientsView`. Возвращено — зелёный.
 */

const ROOT = process.cwd();

/** Не перечисление: карточка ОДНОГО клиента за его ключом (RKN-FIX-10 — детальные чтения вне следа). */
const NOT_A_LIST: Record<string, string> = {
  "src/lib/master/clients-view.service.ts#getMasterClientDetail": "карточка одного клиента по ключу — не перечисление базы",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

type Fn = { name: string; exported: boolean; body: ts.Node };

function functionsOf(sf: ts.SourceFile): Fn[] {
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

function reaches(fn: Fn, target: string, byName: Map<string, Fn>, seen = new Set<string>()): boolean {
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

const family: Array<{ site: string; traced: boolean }> = [];
for (const full of walk(join(ROOT, "src"))) {
  const text = readFileSync(full, "utf8");
  if (!text.includes("groupBookings(")) continue;
  const rel = relative(ROOT, full).split(sep).join("/");
  if (rel === "src/lib/crm/clients.ts") continue;
  const fns = functionsOf(parseSource(rel, text));
  const byName = new Map(fns.map((f) => [f.name, f]));
  for (const fn of fns.filter((f) => f.exported)) {
    if (!reaches(fn, "groupBookings", byName)) continue;
    family.push({ site: `${rel}#${fn.name}`, traced: reaches(fn, "recordPdAccess", byName) });
  }
}

describe("след массовых чтений ПДн — полнота", () => {
  it("семья найдена: API-списки и SSR-страницы мастера и студии", () => {
    const sites = family.map((f) => f.site);
    for (const expected of [
      "src/lib/master/clients.service.ts#getMasterClients",
      "src/lib/studio/clients.service.ts#getStudioClients",
      "src/lib/master/clients-view.service.ts#getMasterClientsView",
      "src/features/studio-cabinet/clients/server/clients-data.service.ts#loadStudioClientsData",
    ]) {
      expect(sites, expected).toContain(expected);
    }
  });

  it("каждая функция, отдающая список клиентов, пишет след", () => {
    const missing = family.filter((f) => !f.traced && !(f.site in NOT_A_LIST)).map((f) => f.site);
    expect(missing, `список клиентов без следа recordPdAccess: ${missing.join(", ")}`).toEqual([]);
  });

  it("исключения не протухли", () => {
    const sites = new Set(family.map((f) => f.site));
    for (const site of Object.keys(NOT_A_LIST)) expect(sites.has(site), site).toBe(true);
  });
});
