/**
 * 29.09 доработки · 19 (UI-12) — движение продукта одним набором.
 *
 * Кривая и длительность перехода берутся из `src/lib/ui/motion.ts` (`MOTION`,
 * `EASE`, `SPRING_SHEET`); литерал `ease:` или `duration: <число>` в объекте
 * перехода вне модуля — это и есть разнобой, от которого набор заведён: до него в
 * дереве жили 5 кривых и 17 длительностей framer, а «второй канон»
 * `[0.25, 0.1, 0.25, 1]` сидел в восьми файлах ЛОКАЛЬНОЙ КОНСТАНТОЙ —
 * поэтому сторож разрешает идентификатор в его локальное объявление и судит
 * значение, а не форму записи.
 *
 * Исключения — посайтовые (GUARD-INTEGRITY: никогда пофайловые): комментарий
 * `motion-canon: <причина>` перед сайтом (перед инструкцией, JSX-атрибутом или
 * свойством). Реестр исключений заморожен: новое — падение, пока его не внесут
 * сюда с причиной; исчезнувшее — тоже падение (реестр не должен протухать).
 *
 * Разбор — компилятором, а не регекспом по тексту (GUARD-INTEGRITY п. 6:
 * регексп терял бы сайт с комментарием в хвосте и не видел бы константу).
 * Слепые формы (названы): длительность, вычисленная из импортированной
 * константы (`X / 1000`), и объект перехода, собранный в другом модуле.
 *
 * @probe 2026-09-30:
 *   1. `transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}` в
 *      `features/faq/components/faq-item.tsx` → красный:
 *      «src/features/faq/components/faq-item.tsx:44 — duration: 0.2» и
 *      «…:44 — ease: [0.25, 0.1, 0.25, 1]».
 *   2. Тот же литерал через соседнюю константу — `const E = [0.25, 0.1, 0.25, 1] as const;`
 *      и `transition={{ ...MOTION.micro, ease: E }}` → красный
 *      «src/features/faq/components/faq-item.tsx:45 — ease: E = [0.25, 0.1, 0.25, 1]»:
 *      именно так жили восемь файлов «второго канона».
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { findInitializer, parseSource } from "@/lib/testing/prisma-calls";

import { EASE } from "./motion";

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");
const MARK = "motion-canon";

/**
 * Замороженный реестр намеренных литералов: файл → число помеченных сайтов.
 * Кроме двух движений, которые не переходы (волна «проверяем» в OTP и таймер
 * кадра сториз), здесь API Яндекс.Карт — у него `duration` в миллисекундах.
 */
const MARKED_SITES: Record<string, number> = {
  "src/components/ui/otp-input.tsx": 1,
  "src/features/home/components/stories-viewer-overlay.tsx": 1,
  "src/features/catalog/components/catalog-map.tsx": 3,
};

type Site = { line: number; what: string; marked: boolean };

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
  return cur;
}

function numericArray(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  return (
    ts.isArrayLiteralExpression(e) &&
    e.elements.length > 0 &&
    e.elements.every((el) => ts.isNumericLiteral(el) || (ts.isPrefixUnaryExpression(el) && ts.isNumericLiteral(el.operand)))
  );
}

function nonZeroNumber(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (ts.isNumericLiteral(e)) return Number(e.text) !== 0;
  if (ts.isConditionalExpression(e)) return nonZeroNumber(e.whenTrue) || nonZeroNumber(e.whenFalse);
  return false;
}

/** Литерал кривой/длительности — сам или через локальную константу. */
function literalValue(prop: "ease" | "duration", init: ts.Expression): string | null {
  const e = unwrap(init);
  const isLiteral = prop === "ease" ? (x: ts.Expression) => numericArray(x) || ts.isStringLiteral(unwrap(x)) : nonZeroNumber;
  if (isLiteral(e)) return e.getText();
  if (ts.isIdentifier(e)) {
    const decl = findInitializer(e);
    if (decl && isLiteral(decl)) return `${e.text} = ${unwrap(decl).getText()}`;
  }
  return null;
}

/** Метка `motion-canon:` — перед сайтом или любым предком до инструкции включительно. */
function isMarked(sf: ts.SourceFile, node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur && !ts.isSourceFile(cur)) {
    const ranges = ts.getLeadingCommentRanges(sf.text, cur.getFullStart()) ?? [];
    for (const r of ranges) {
      const text = sf.text.slice(r.pos, r.end).replace(/^\/\/\s?|^\/\*+\s?|\s?\*+\/$/g, "").trim();
      if (new RegExp(`^${MARK}:\\s*\\S`).test(text)) return true;
    }
    // JSX-атрибуты: комментарий в списке атрибутов не «ведущий» для узла —
    // смотрим строку над атрибутом.
    if (ts.isJsxAttribute(cur)) {
      const { line } = sf.getLineAndCharacterOfPosition(cur.getStart(sf));
      const prev = sf.text.split("\n")[line - 1] ?? "";
      if (new RegExp(`//\\s*${MARK}:\\s*\\S`).test(prev)) return true;
    }
    if (ts.isStatement(cur)) break;
    cur = cur.parent;
  }
  return false;
}

function scanCanon(file: string, text: string): Site[] {
  const sf = parseSource(file, text);
  const sites: Site[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      if (name === "ease" || name === "duration") {
        const value = literalValue(name, node.initializer);
        if (value !== null) {
          sites.push({
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            what: `${name}: ${value.replace(/\s+/g, " ")}`,
            marked: isMarked(sf, node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

describe("машинерия сторожа канона", () => {
  it("литерал, соседняя константа, тернарник; метка на месте; импорт и строка — не литерал", () => {
    const sites = scanCanon(
      "fixture.tsx",
      [
        'import { MOTION, EASE } from "@/lib/ui/motion";',
        "const E = [0.25, 0.1, 0.25, 1] as const;",
        "export const a = { duration: 0.3, ease: [0.4, 0, 0.2, 1] };",
        "export const b = { duration: 0.3, ease: E };",
        "export const c = { duration: reduce ? 0 : 0.22, ease: EASE };",
        "export const d = { ...MOTION.base, duration: 0 };",
        'export const t = { duration: "Время" };',
        "export const X = () => (",
        "  <m.div",
        "    // motion-canon: намеренно",
        '    transition={{ duration: 1.15, ease: "easeInOut" }}',
        "  />",
        ");",
      ].join("\n"),
    );
    expect(sites.map((s) => `${s.line}:${s.what.split(":")[0]}${s.marked ? "+" : ""}`)).toEqual([
      "3:duration",
      "3:ease",
      "4:duration",
      "4:ease",
      "5:duration",
      "11:duration+",
      "11:ease+",
    ]);
  });
});

describe("движение одним набором (UI-12)", () => {
  const files = listSourceFiles().filter((file) => !rel(file).startsWith("src/lib/ui/motion.ts"));
  const results = files
    .map((file) => [rel(file), scanCanon(file, readFileSync(file, "utf8"))] as const)
    .filter(([, sites]) => sites.length > 0);

  it("литеральных кривых и длительностей вне src/lib/ui/motion.ts нет (кроме реестра)", () => {
    const violations = results.flatMap(([file, sites]) =>
      sites.filter((s) => !s.marked).map((s) => `${file}:${s.line} — ${s.what}`),
    );
    expect(violations, "переход — из MOTION / SPRING_SHEET (src/lib/ui/motion.ts)").toEqual([]);
  });

  it("реестр помеченных сайтов заморожен", () => {
    const actual: Record<string, number> = {};
    for (const [file, sites] of results) {
      const marked = sites.filter((s) => s.marked);
      // сайт помечается один раз, даже если в объекте и ease, и duration
      const lines = new Set(marked.map((s) => s.line));
      if (lines.size > 0) actual[file] = lines.size;
    }
    expect(actual, "новое исключение — сюда, с причиной в метке; исчезнувшее — убрать из MARKED_SITES").toEqual(
      MARKED_SITES,
    );
  });

  it("кривая Tailwind `ease-brand` совпадает с EASE", () => {
    const require = createRequire(import.meta.url);
    const config = require(resolve(process.cwd(), "tailwind.config.js")) as {
      theme: { extend: { transitionTimingFunction?: Record<string, string> } };
    };
    expect(config.theme.extend.transitionTimingFunction?.brand).toBe(`cubic-bezier(${EASE.join(", ")})`);
  });
});
