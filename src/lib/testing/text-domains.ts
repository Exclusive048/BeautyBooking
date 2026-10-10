/**
 * Какие домены UI-текстов достаются браузеру (29.09 доработки · 18, PERF-02).
 *
 * `src/lib/ui/text.ts` — барель над доменами `src/lib/ui/text/*`, потребители
 * импортируют его пространством имён (`import * as UI_TEXT`), и webpack везёт в
 * браузер только домены, к которым модуль обращается СТАТИЧЕСКИ:
 * `UI_TEXT.<домен>.…`. Отсюда два вопроса, на которые отвечает этот модуль:
 *
 * - какие домены называет файл (`readTextUsage(file).domains`);
 * - где файл обращается к пространству имён так, что отслеживание выключается
 *   (`UI_TEXT` значением целиком, `UI_TEXT[…]`, `const T = UI_TEXT`, аргументом,
 *   спредом) — тогда webpack берёт ВСЕ домены (`readTextUsage(file).opaque`).
 *
 * Разбор — компилятором, не регуляркой: `UI_TEXT` в комментарии, строке или
 * позиции типа (`typeof UI_TEXT.x` стирается) не должен давать ни домена, ни
 * нарушения. Модуль — только для тестов.
 */
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";

import { isServerActionModule, readImports, resolveSpecifier, SRC } from "@/lib/testing/client-graph";

export const TEXT_BARREL = join(SRC, "lib", "ui", "text.ts");
export const TEXT_DIR = join(SRC, "lib", "ui", "text");
export const TEXT_SPECIFIER = "@/lib/ui/text";

export type TextUsage = {
  /** Локальные имена пространства имён `@/lib/ui/text` в файле. */
  namespaces: string[];
  /** Прочие формы импорта барели (именованный, default, `export … from`). */
  otherImportForms: string[];
  /** Домены, к которым файл обращается статически. */
  domains: Set<string>;
  /** Места, выключающие отслеживание доступа: `строка: фрагмент`. */
  opaque: string[];
};

function isInTypePosition(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isTypeNode(cur)) return true;
    if (ts.isStatement(cur) || ts.isSourceFile(cur)) return false;
  }
  return false;
}

export function readTextUsage(file: string): TextUsage {
  return readTextUsageFromSource(readFileSync(file, "utf8"), file);
}

/** То же по тексту модуля — для фикстур машинерии в тестах. */
export function readTextUsageFromSource(text: string, fileName = "fixture.tsx"): TextUsage {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespaces: string[] = [];
  const otherImportForms: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.moduleSpecifier.text !== TEXT_SPECIFIER) continue;
      const clause = statement.importClause;
      if (clause && !clause.isTypeOnly && !clause.name && clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        namespaces.push(clause.namedBindings.name.text);
      } else if (!clause?.isTypeOnly) {
        otherImportForms.push(statement.getText(source));
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === TEXT_SPECIFIER &&
      !statement.isTypeOnly
    ) {
      otherImportForms.push(statement.getText(source));
    }
  }

  const domains = new Set<string>();
  const opaque: string[] = [];
  if (namespaces.length > 0) {
    const names = new Set(namespaces);
    const visit = (node: ts.Node) => {
      if (
        ts.isIdentifier(node) &&
        names.has(node.text) &&
        !ts.isNamespaceImport(node.parent) &&
        !isInTypePosition(node)
      ) {
        const parent = node.parent;
        const isPropertyName = ts.isPropertyAccessExpression(parent) && parent.name === node;
        if (!isPropertyName) {
          if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
            domains.add(parent.name.text);
          } else {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            opaque.push(`${line + 1}: ${parent.getText(source).slice(0, 80)}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { namespaces, otherImportForms, domains, opaque };
}

function isClientModule(file: string): boolean {
  return /^\s*["']use client["']/m.test(readFileSync(file, "utf8").slice(0, 400));
}

export type ClientReach = {
  /** Модули, чьё тело уходит в браузер (клиентская граница и всё за ней). */
  clientModules: Set<string>;
  /** Родитель в обходе (кратчайшая цепочка от входа). */
  parent: Map<string, string>;
};

/**
 * Клиентская часть графа от серверного входа (layout / page): по value-рёбрам
 * через серверные модули до `"use client"`, а от границы — всё подряд, кроме
 * `"use server"` (клиент получает прокси, а не тело). Барель текстов и файлы
 * доменов в обход не входят: доступ к ним считается по обращениям, а не по рёбрам.
 */
export function clientReachFrom(entry: string): ClientReach {
  const parent = new Map<string, string>();
  const clientModules = new Set<string>();
  const seen = new Set<string>([entry]);
  const queue: Array<{ file: string; client: boolean }> = [{ file: entry, client: isClientModule(entry) }];

  while (queue.length > 0) {
    const { file, client } = queue.shift() as { file: string; client: boolean };
    if (client) clientModules.add(file);
    for (const spec of readImports(file).valueSpecifiers) {
      const resolved = resolveSpecifier(spec, file);
      if (!resolved || seen.has(resolved)) continue;
      if (resolved === TEXT_BARREL || resolved.startsWith(TEXT_DIR + sep)) continue;
      if (isServerActionModule(resolved)) continue;
      seen.add(resolved);
      parent.set(resolved, file);
      queue.push({ file: resolved, client: client || isClientModule(resolved) });
    }
  }

  return { clientModules, parent };
}

/** Цепочка от входа до модуля: `layout.tsx → topbar.tsx → auth-user-menu.tsx`. */
export function chainTo(reach: ClientReach, file: string, rel: (f: string) => string): string {
  const chain = [file];
  for (let cur = reach.parent.get(file); cur; cur = reach.parent.get(cur)) chain.unshift(cur);
  return chain.map(rel).join(" → ");
}

/** Домены, достающиеся браузеру от входа, и первый модуль-обращение к каждому. */
export function clientDomainsFrom(entry: string): { reach: ClientReach; domains: Map<string, string[]> } {
  const reach = clientReachFrom(entry);
  const domains = new Map<string, string[]>();
  for (const file of reach.clientModules) {
    for (const domain of readTextUsage(file).domains) {
      const list = domains.get(domain) ?? [];
      list.push(file);
      domains.set(domain, list);
    }
  }
  return { reach, domains };
}

/**
 * Как модуль читает КЛЮЧИ текстов (UI-TEXT-DEAD-KEY-SWEEP): путь от домена и
 * вид обращения. Сторож «ключ без читателя» (`lib/ui/text-dead-keys.test.ts`)
 * собирает их по дереву и судит, у какого ключа читателей нет.
 *
 * - `read` — цепочка дошла до конца: `UI_TEXT.a.b.c`, в том числе через
 *   псевдоним (`const T = UI_TEXT.a; T.b.c`) и деструктуризацию
 *   (`const { b } = UI_TEXT.a`). Псевдоним прослеживается по имени в файле.
 * - `whole` — поддерево ушло значением, и что из него читают дальше, отсюда не
 *   видно: индекс (`T[key]`), аргумент, проп, спред, `return`, `Object.keys`,
 *   экспортированный псевдоним, позиция типа (`keyof typeof T`). Такое
 *   поддерево сторож считает прочитанным ЦЕЛИКОМ — ошибка в безопасную сторону:
 *   пропустить мёртвый ключ можно, объявить мёртвым живой — нет.
 *
 * Путь может быть длиннее ключа (`T.items.map`, `T.title.replace`) — укорачивает
 * его сторож, он знает дерево ключей.
 */
export type TextKeyAccess = { path: string[]; kind: "read" | "whole" };

const MAX_ALIAS_DEPTH = 6;

function isPassThrough(node: ts.Node): boolean {
  return (
    ts.isNonNullExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  );
}

export function readTextKeyAccessFromSource(text: string, fileName: string): TextKeyAccess[] {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const namespaces = readTextUsageFromSource(text, fileName).namespaces;
  const out: TextKeyAccess[] = [];
  if (namespaces.length === 0) return out;

  // Все идентификаторы файла по имени — для прослеживания псевдонимов.
  const byName = new Map<string, ts.Identifier[]>();
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const list = byName.get(node.text) ?? [];
      list.push(node);
      byName.set(node.text, list);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const isReference = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if (ts.isQualifiedName(p) && p.right === id) return false;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === id) {
      return false;
    }
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    if (ts.isVariableDeclaration(p) && p.name === id) return false;
    if (ts.isBindingElement(p) && p.name === id) return false;
    if (ts.isParameter(p) && p.name === id) return false;
    if (ts.isImportSpecifier(p) || ts.isNamespaceImport(p) || ts.isImportClause(p)) return false;
    if (ts.isJsxAttribute(p) && p.name === id) return false;
    // Тип с тем же именем (`<T>`, `Props<T>`) — не переменная: значение в
    // позиции типа читается только через `typeof`, а это TypeQuery.
    if (ts.isTypeParameterDeclaration(p) || ts.isTypeReferenceNode(p)) return false;
    return true;
  };

  const trackAlias = (name: string, path: string[], depth: number) => {
    for (const ref of byName.get(name) ?? []) {
      if (isReference(ref)) walk(ref, path, depth + 1);
    }
  };

  function walk(start: ts.Node, basePath: string[], depth: number): void {
    if (depth > MAX_ALIAS_DEPTH) {
      out.push({ path: basePath, kind: "whole" });
      return;
    }
    const path = [...basePath];
    let cur: ts.Node = start;
    for (;;) {
      const parent = cur.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === cur) {
        path.push(parent.name.text);
        cur = parent;
      } else if (ts.isQualifiedName(parent) && parent.left === cur) {
        path.push(parent.right.text);
        cur = parent;
      } else if (isPassThrough(parent)) {
        cur = parent;
      } else {
        break;
      }
    }
    if (path.length === 0) {
      // Пространство имён целиком — его форму судит text-client-graph.test.ts;
      // здесь это «всё прочитано».
      out.push({ path, kind: "whole" });
      return;
    }
    const parent = cur.parent;
    if (isInTypePosition(cur) || ts.isTypeQueryNode(parent)) {
      out.push({ path, kind: "whole" });
      return;
    }
    if (ts.isElementAccessExpression(parent) && parent.expression === cur) {
      out.push({ path, kind: "whole" });
      return;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === cur) {
      const statement = parent.parent?.parent;
      const exported =
        statement !== undefined &&
        ts.isVariableStatement(statement) &&
        (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exported) {
        out.push({ path, kind: "whole" });
        return;
      }
      if (ts.isIdentifier(parent.name)) {
        out.push({ path, kind: "read" });
        trackAlias(parent.name.text, path, depth);
        return;
      }
      if (ts.isObjectBindingPattern(parent.name)) {
        out.push({ path, kind: "read" });
        for (const element of parent.name.elements) {
          if (element.dotDotDotToken) {
            out.push({ path, kind: "whole" });
            continue;
          }
          const key = element.propertyName ?? element.name;
          if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) {
            out.push({ path, kind: "whole" });
            continue;
          }
          const sub = [...path, key.text];
          out.push({ path: sub, kind: "read" });
          if (ts.isIdentifier(element.name)) trackAlias(element.name.text, sub, depth);
          else out.push({ path: sub, kind: "whole" });
        }
        return;
      }
      out.push({ path, kind: "whole" });
      return;
    }
    // Значение ушло дальше (вызов, проп, шаблон, `return`, …). Для листа это
    // обычное чтение, для поддерева — «целиком»: решает сторож по дереву ключей.
    out.push({ path, kind: "whole" });
  }

  const names = new Set(namespaces);
  for (const name of names) {
    for (const ref of byName.get(name) ?? []) {
      if (!isReference(ref)) continue;
      walk(ref, [], 0);
    }
  }
  return out;
}
