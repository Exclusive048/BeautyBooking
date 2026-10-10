import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * VITEST-MJS-CRLF-DOCBLOCK — `.mjs`, который импортирует тест, не начинается
 * с shebang.
 *
 * `scripts/check-dead-classes.test.ts` на Windows-чекауте падал
 * `SyntaxError: Invalid or unexpected token` без стека, а в CI был зелёным.
 * Триггер — связка «строка `#!/usr/bin/env node` + CRLF»: тот же файл без
 * shebang, но с CRLF во всех строках, загружается и проходит (замер
 * 2026-10-10: 10/10); с shebang и LF — тоже. В git `.mjs` хранятся с LF, CRLF
 * появляется только у чекаута с `core.autocrlf=true`, поэтому CI на Linux
 * поломку не видит никогда — её видит лишь разработчик на Windows, и читает
 * как «один красный файл, это норма».
 *
 * Shebang у скриптов проекта не нужен: все гейты запускаются `node scripts/…`
 * из `package.json`, бит исполнения в git не стоит. Поэтому правило простое:
 * модуль, импортируемый тестом, shebang не несёт. Набор модулей выводится из
 * самих тестов (статический `from "…mjs"` и `import("…mjs")`), а не из списка.
 *
 * @probe 2026-10-10: в `scripts/check-dead-classes.mjs` возвращена первая
 *        строка `#!/usr/bin/env node` → красный «модули, которые импортируют
 *        тесты, без shebang» с `scripts/check-dead-classes.mjs` в списке.
 *        Восстановлено.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts", "prisma"];
const SKIP_DIRS = new Set(["node_modules", ".next", "generated"]);
const TEST_FILE = /\.test\.tsx?$/;
const MJS_IMPORT = /(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+\.mjs)["']/g;

function listTestFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listTestFiles(join(dir, entry.name), out);
    } else if (TEST_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
}

function testImportedMjsModules(): string[] {
  const testFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (existsSync(abs)) listTestFiles(abs, testFiles);
  }
  const modules = new Set<string>();
  for (const file of testFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(MJS_IMPORT)) {
      const target = resolve(dirname(file), match[1]!);
      if (existsSync(target)) modules.add(relative(ROOT, target).replaceAll("\\", "/"));
    }
  }
  return [...modules].sort();
}

describe("VITEST-MJS-CRLF-DOCBLOCK · модули, которые импортируют тесты, без shebang", () => {
  const modules = testImportedMjsModules();

  it("набор выведен из тестов и не пуст", () => {
    // Не-вакуумность: разборщик обязан находить хотя бы известные импорты.
    expect(modules).toContain("scripts/check-dead-classes.mjs");
    expect(modules).toContain("scripts/raw-sql-objects.mjs");
  });

  it("модули, которые импортируют тесты, без shebang", () => {
    const withShebang = modules.filter((rel) =>
      readFileSync(join(ROOT, rel), "utf8").startsWith("#!")
    );
    expect(withShebang, "shebang + CRLF на Windows-чекауте роняет загрузку модуля в vitest").toEqual([]);
  });
});
