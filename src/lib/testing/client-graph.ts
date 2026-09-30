/**
 * Граф импортов `src/` для сторожей: какие модули попадают в клиентский бандл.
 *
 * Вынесено из PERF-11 (`lib/prisma-enums.test.ts`), чтобы второй сторож —
 * «серверная дата без пояса» (`billing/deadline-label.test.ts`) — считал
 * «только серверный модуль» по ТОМУ ЖЕ графу, а не по признакам в имени файла:
 * серверный компонент (`studio-today-banner.tsx`) не несёт ни `server-only`,
 * ни `/server/` в пути, и признаки по имени его не видят.
 *
 * Модуль — только для тестов: читает файлы и зовёт компилятор TypeScript.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import ts from "typescript";

export const ROOT = process.cwd();
export const SRC = join(ROOT, "src");
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

/** Разрешает `@/…` и относительный спецификатор в файл дерева; внешние пакеты → null. */
export function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(dirname(fromFile), spec);
  else return null;

  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const ext of RESOLVE_EXTS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export type FileImports = {
  /** Спецификаторы, которые останутся в рантайме (не стёртые компилятором). */
  valueSpecifiers: string[];
  /** Имена, импортированные значением из `@prisma/client`, либо null. */
  prismaValueNames: string[] | null;
};

/**
 * Разбирает импорты ЧЕРЕЗ КОМПИЛЯТОР, а не регуляркой: `import { type A, B }`,
 * многострочные клаузы и `export … from` регуляркой разбираются неверно, а цена
 * ошибки здесь — ложно-зелёный гейт.
 */
export function readImports(file: string): FileImports {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const valueSpecifiers: string[] = [];
  let prismaValueNames: string[] | null = null;

  for (const statement of source.statements) {
    let moduleSpecifier: string | null = null;
    let names: string[] = [];
    let isValue = false;

    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      moduleSpecifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) {
        isValue = true; // side-effect import — остаётся в бандле
      } else if (clause.isTypeOnly) {
        isValue = false; // `import type …` — стирается
      } else if (clause.name) {
        isValue = true;
        names = [clause.name.text];
      } else if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          isValue = true;
          names = [`* as ${clause.namedBindings.name.text}`];
        } else {
          const valueElements = clause.namedBindings.elements.filter((el) => !el.isTypeOnly);
          isValue = valueElements.length > 0;
          names = valueElements.map((el) => el.name.text);
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      moduleSpecifier = statement.moduleSpecifier.text;
      if (statement.isTypeOnly) {
        isValue = false;
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const valueElements = statement.exportClause.elements.filter((el) => !el.isTypeOnly);
        isValue = valueElements.length > 0;
        names = valueElements.map((el) => el.name.text);
      } else {
        isValue = true; // `export * from …`
      }
    }

    if (!moduleSpecifier || !isValue) continue;
    if (moduleSpecifier === "@prisma/client") prismaValueNames = names;
    valueSpecifiers.push(moduleSpecifier);
  }

  return { valueSpecifiers, prismaValueNames };
}

export function collectClientSeeds(): string[] {
  const seeds: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        // Директива обязана быть в начале файла — читаем только шапку.
        if (/^\s*["']use client["']/m.test(readFileSync(full, "utf8").slice(0, 400))) {
          seeds.push(full);
        }
      }
    }
  };
  walk(SRC);
  return seeds;
}

/**
 * `"use server"` — граница server actions: клиент получает прокси-ссылку, а не тело
 * модуля, поэтому обход обязан на ней останавливаться. Без этого граф «дотягивался»
 * до `lib/prisma.ts` через `model-offers/intro-seen-action.ts` и давал ложное
 * срабатывание — при том, что `prisma.ts` держит `import "server-only"` и реальное
 * попадание в клиентский бандл уронило бы билд.
 */
export function isServerActionModule(file: string): boolean {
  return /^\s*["']use server["']/m.test(readFileSync(file, "utf8").slice(0, 400));
}

/** Транзитивное замыкание по value-рёбрам от всех `"use client"`-файлов. */
export function walkClientGraph(): { visited: Set<string>; via: Map<string, string> } {
  const visited = new Set<string>();
  const via = new Map<string, string>();
  const stack = collectClientSeeds();

  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);

    for (const spec of readImports(file).valueSpecifiers) {
      const resolved = resolveSpecifier(spec, file);
      if (!resolved || visited.has(resolved)) continue;
      if (isServerActionModule(resolved)) continue; // тело в браузер не едет
      if (!via.has(resolved)) via.set(resolved, file);
      stack.push(resolved);
    }
  }

  return { visited, via };
}

/** Все исходники `src/` (без тестов) — `.ts` / `.tsx`. */
export function listSourceFiles(dir: string = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}
