import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * GATE-COMMENT-BLINDNESS — `check:error-message-lang` судит код, а не прозу.
 *
 * Гейт гоняется настоящим процессом на фикстуре (`cwd` — временный каталог со
 * своим `src/`): проверяется то, что увидит CI, а не функция по отдельности.
 *
 * @probe 2026-10-10:
 *   · вызов `stripComments` в гейте убран (`const source = readFileSync(…)`) —
 *     красный «упоминание в комментарии — не вызов»: гейт упал на `"Not found"`
 *     из JSDoc;
 *   · `stripComments` заменён ходовым шаблоном FIX-C5
 *     `replace(/^[^\n]*?\/\/.*$/gm, "")` — 2 красных: «хвостовой комментарий
 *     не прячет вызов» (строка с нарушением исчезла целиком, гейт зелёный) и
 *     «упоминание в комментарии — не вызов» (строки JSDoc шаблон не трогает).
 *   Восстановлено, 3/3 зелено.
 */

const GATE = path.resolve(__dirname, "check-error-message-lang.mjs");

let fixture: string | null = null;

function runGate(files: Record<string, string>) {
  fixture = mkdtempSync(path.join(tmpdir(), "eml-gate-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(fixture, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const result = spawnSync(process.execPath, [GATE], { cwd: fixture, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = null;
});

describe("check:error-message-lang — комментарии", () => {
  it("упоминание в комментарии — не вызов", () => {
    const { status, output } = runGate({
      "src/route.ts": [
        "/**",
        ' * Раньше сюда уходил `fail("Not found", 404)` — английский текст в UI.',
        " */",
        '// и ещё jsonFail(404, "Gone") в старой версии',
        "export function GET() {",
        '  return fail("Запись не найдена.", 404);',
        "}",
        "",
      ].join("\n"),
    });
    expect(output).not.toContain("Not found");
    expect(status).toBe(0);
  });

  it("хвостовой комментарий не прячет вызов", () => {
    const { status, output } = runGate({
      "src/route.ts": ["export function GET() {", '  return fail("Not found", 404); // пояснение', "}", ""].join("\n"),
    });
    expect(status).toBe(1);
    expect(output).toContain('"Not found"');
  });

  it("номер строки после многострочного комментария не съезжает", () => {
    const { status, output } = runGate({
      "src/route.ts": [
        "/*",
        " * многострочный",
        " * комментарий",
        " */",
        'export const x = () => fail("Not found", 404);',
        "",
      ].join("\n"),
    });
    expect(status).toBe(1);
    expect(output).toContain("src/route.ts:5");
  });
});
