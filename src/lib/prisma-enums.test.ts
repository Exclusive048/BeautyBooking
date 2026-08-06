/**
 * PERF-11 guard — браузерный рантайм `@prisma/client` не попадает в клиентский бандл.
 *
 * `@prisma/client` в `serverExternalPackages` (`next.config.ts`) на клиентский
 * граф НЕ влияет — тот список только серверный. Поэтому единственный **value**-импорт
 * из `@prisma/client` где-нибудь в дереве, достижимом от `"use client"`, молча
 * затаскивает в браузер `index-browser.js` (~66 kB parsed / 21 kB gzip) — билд при
 * этом зелёный, вес просто появляется. Именно так это и прожило: 15 компонентов
 * импортировали enum'ы значением ради `BookingStatus.CONFIRMED`.
 *
 * Тест обходит граф от каждого `"use client"`-файла по **value**-рёбрам (импорты
 * `import type` / инлайн-`type` стираются компилятором и в бандл не идут) и требует,
 * чтобы ни один достигнутый модуль не импортировал `@prisma/client` значением.
 * Значения enum'ов для клиента живут в `@/lib/prisma-enums`.
 *
 * Не-вакуумность: тест прогонялся с восстановленным `import { BookingStatus } from
 * "@prisma/client"` в `bookings-filters.tsx` — падал с указанием файла и цепочки.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as PrismaRuntime from "@prisma/client";

import * as Mirrors from "./prisma-enums";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

/** Разрешает `@/…` и относительный спецификатор в файл дерева; внешние пакеты → null. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
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

type FileImports = {
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
function readImports(file: string): FileImports {
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

function collectClientSeeds(): string[] {
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
function isServerActionModule(file: string): boolean {
  return /^\s*["']use server["']/m.test(readFileSync(file, "utf8").slice(0, 400));
}

/** Транзитивное замыкание по value-рёбрам от всех `"use client"`-файлов. */
function walkClientGraph(): { visited: Set<string>; via: Map<string, string> } {
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

describe("PERF-11 — @prisma/client не попадает в клиентский бандл", () => {
  it("ни один модуль клиентского графа не импортирует @prisma/client значением", () => {
    const { visited, via } = walkClientGraph();
    expect(visited.size).toBeGreaterThan(200); // граф действительно обойден

    const violations: string[] = [];
    for (const file of [...visited].sort()) {
      const names = readImports(file).prismaValueNames;
      if (names === null) continue;
      const importer = via.get(file);
      violations.push(
        `${relative(ROOT, file)} — { ${names.join(", ")} }` +
          (importer ? ` (через ${relative(ROOT, importer)})` : " ('use client')"),
      );
    }

    expect(
      violations,
      "value-импорт @prisma/client тянет index-browser.js (~66 kB) в браузер; " +
        "значения enum'ов — из @/lib/prisma-enums, типы — через `import type`",
    ).toEqual([]);
  });

  it("сам @/lib/prisma-enums не импортирует @prisma/client значением", () => {
    expect(readImports(join(SRC, "lib", "prisma-enums.ts")).prismaValueNames).toBeNull();
  });
});

describe("зеркала enum'ов совпадают с рантаймом Prisma", () => {
  // Компилятор уже держит exhaustive-ность (`satisfies EnumMirror<…>`); это второй,
  // независимый слой — на случай, если `satisfies` в зеркале однажды ослабят.
  const MIRRORED = [
    "AccountType",
    "BillingPaymentStatus",
    "BookingSource",
    "BookingStatus",
    "DiscountType",
    "MediaEntityType",
    "NotificationType",
    "PlanTier",
    "ProviderType",
    "ReviewReportReason",
    "ReviewTargetType",
    "ScheduleChangeRequestStatus",
    "SubscriptionScope",
    "SubscriptionStatus",
  ] as const;

  it.each(MIRRORED)("%s", (name) => {
    const mirror = (Mirrors as unknown as Record<string, Record<string, string>>)[name];
    const runtime = (PrismaRuntime as unknown as Record<string, Record<string, string>>)[name];
    expect(mirror, `в @/lib/prisma-enums нет зеркала ${name}`).toBeDefined();
    expect(runtime, `в @prisma/client нет enum ${name}`).toBeDefined();
    expect(mirror).toEqual(runtime);
  });
});
