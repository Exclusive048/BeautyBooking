/**
 * 29.09 доработки · 21 (UI-14) — единая шкала z-index.
 *
 * Глобальные слои (от корня документа) — именованные токены `theme.extend.zIndex`
 * в `tailwind.config.js`: `sticky < topbar ≤ float < nav < notice < prompt <
 * scrim < modal < popover < toast`. До шкалы в дереве было 105 сайтов и ни одного
 * имени: `z-50` значил и модалку, и выпадающий список, и тост, а `z-[100]` /
 * `z-[9999]` были попытками перекрыть слой числом побольше — внутри шапки
 * (`sticky` + `backdrop-blur`) они всё равно жили на уровне шапки.
 *
 * Проверяется: (а) порядок слоёв — из конфига, не из этого файла; (б) в классах
 * `src/` нет числовых `z-40` / `z-50` (глобальные слои — только токенами) и нет
 * произвольных `z-[…]`; (в) исключения — посайтовые, меткой `// z-index:
 * <причина>` перед сайтом, из замороженного реестра. Локальные слои внутри
 * контекста родителя — числами `z-0/1/2/10/20/30`.
 *
 * Разбор — компилятором по строковым литералам (классы в комментариях не
 * считаются). Слепая форма (названа): локальное число на элементе, который на
 * деле глобальный (`fixed` с `z-30`), — его держит поведенческий сторож
 * `.qa/overlay-stacking.spec.ts` (`elementFromPoint`, а не классы).
 *
 * @probe 2026-09-30:
 *   1. `z-[80]` в `components/layout/cookie-notice.tsx` вместо `z-notice` →
 *      (б) красный «src/components/layout/cookie-notice.tsx:61 — z-[80]».
 *   2. `nav: "55"` в `tailwind.config.js` → (а) красный «notice (45) должен быть
 *      выше nav (55)».
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { parseSource } from "@/lib/testing/prisma-calls";

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");
const MARK = "z-index";

/** Порядок глобальных слоёв снизу вверх; `≤` — слои одного уровня. */
const ORDER: Array<[string, "<" | "<="]> = [
  ["sticky", "<"],
  ["topbar", "<="],
  ["float", "<"],
  ["nav", "<"],
  ["notice", "<"],
  ["prompt", "<"],
  ["scrim", "<"],
  ["modal", "<"],
  ["popover", "<"],
  ["toast", "<"],
];

/** Посайтовые исключения: файл → число помеченных сайтов. Сейчас — ни одного. */
const MARKED_SITES: Record<string, number> = {};

const Z_CLASS = /(?<![\w-])((?:[a-z0-9-]+:)*)-?z-(\[[^\]\s]+\]|\d+)(?![\w[-])/g;

type Site = { line: number; cls: string; marked: boolean };

function isMarked(sf: ts.SourceFile, node: ts.Node): boolean {
  const lines = sf.text.split("\n");
  let cur: ts.Node | undefined = node;
  while (cur && !ts.isSourceFile(cur)) {
    for (const r of ts.getLeadingCommentRanges(sf.text, cur.getFullStart()) ?? []) {
      const text = sf.text.slice(r.pos, r.end).replace(/^\/\/\s?|^\/\*+\s?|\s?\*+\/$/g, "").trim();
      if (new RegExp(`^${MARK}:\\s*\\S`).test(text)) return true;
    }
    if (ts.isJsxAttribute(cur)) {
      const { line } = sf.getLineAndCharacterOfPosition(cur.getStart(sf));
      if (new RegExp(`//\\s*${MARK}:\\s*\\S`).test(lines[line - 1] ?? "")) return true;
    }
    if (ts.isStatement(cur)) break;
    cur = cur.parent;
  }
  return false;
}

function scanZ(file: string, text: string): Site[] {
  const sf = parseSource(file, text);
  const sites: Site[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const m of node.text.matchAll(Z_CLASS)) {
        const value = m[2];
        const bad = value.startsWith("[") || value === "40" || value === "50";
        if (!bad) continue;
        sites.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          cls: m[0],
          marked: isMarked(sf, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

describe("машинерия сторожа z-index", () => {
  it("ловит числовые z-40/z-50 и произвольные z-[…] в классах, пропускает токены, локальные числа и комментарии", () => {
    const sites = scanZ(
      "fixture.tsx",
      [
        'const a = "fixed inset-0 z-50 bg-black";',
        'const b = `absolute z-[100] ${x}`;',
        'const c = "sticky top-0 z-topbar lg:z-40";',
        'const d = "relative z-10 md:z-30 z-modal";',
        "// z-50 в комментарии — не класс",
        "const e = (",
        "  <div",
        "    // z-index: причина",
        '    className="fixed z-[9999]"',
        "  />",
        ");",
      ].join("\n"),
    );
    expect(sites.map((s) => `${s.line}:${s.cls}${s.marked ? "+" : ""}`)).toEqual([
      "1:z-50",
      "2:z-[100]",
      "3:lg:z-40",
      "9:z-[9999]+",
    ]);
  });
});

describe("шкала z-index (UI-14)", () => {
  const require = createRequire(import.meta.url);
  const config = require(resolve(process.cwd(), "tailwind.config.js")) as {
    theme: { extend: { zIndex?: Record<string, string> } };
  };
  const scale = config.theme.extend.zIndex ?? {};

  it("(а) порядок глобальных слоёв — из конфига", () => {
    const problems: string[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      const [name] = ORDER[i];
      if (!(name in scale)) problems.push(`нет слоя ${name} в theme.extend.zIndex`);
    }
    for (let i = 0; i + 1 < ORDER.length; i++) {
      const [lower, rel_] = ORDER[i];
      const [upper] = ORDER[i + 1];
      const a = Number(scale[lower]);
      const b = Number(scale[upper]);
      const ok = rel_ === "<" ? a < b : a <= b;
      if (!ok) problems.push(`${upper} (${b}) должен быть ${rel_ === "<" ? "выше" : "не ниже"} ${lower} (${a})`);
    }
    // Верхние слои обязаны быть выше любого локального числа (0…30).
    if (Number(scale.nav) <= 30) problems.push(`nav (${scale.nav}) должен быть выше локальных 0…30`);
    expect(problems).toEqual([]);
  });

  const results = listSourceFiles()
    .map((file) => [rel(file), scanZ(file, readFileSync(file, "utf8"))] as const)
    .filter(([, sites]) => sites.length > 0);

  it("(б) нет числовых z-40 / z-50 и произвольных z-[…] (кроме помеченных)", () => {
    const violations = results.flatMap(([file, sites]) =>
      sites.filter((s) => !s.marked).map((s) => `${file}:${s.line} — ${s.cls}`),
    );
    expect(
      violations,
      "глобальный слой — токеном (z-nav, z-modal, z-popover…); перекрыть шапку или нижнюю панель — порталом и z-popover, не числом",
    ).toEqual([]);
  });

  it("(в) реестр посайтовых исключений заморожен", () => {
    const actual: Record<string, number> = {};
    for (const [file, sites] of results) {
      const marked = sites.filter((s) => s.marked).length;
      if (marked > 0) actual[file] = marked;
    }
    expect(actual).toEqual(MARKED_SITES);
  });
});
