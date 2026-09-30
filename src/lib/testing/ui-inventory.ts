/**
 * 29.09 доработки · 22+23 (UI-26 / UI-27) — общая машинерия двух инвентарей:
 * сырые теги управления вне `src/components/ui` и `dark:`-вилки / палитра Tailwind.
 *
 * Разбор — компилятором (как в `motion-imports.test.ts`): JSX-тег и строковый
 * литерал он видит по построению, поэтому тег в комментарии, `"<button>"` внутри
 * строки и `<Button>` не считаются, а многострочный тег и тег в тернарнике —
 * считаются. Маркеры ратификации (`raw-control-ok:` / `dark-ok:`) — это
 * комментарии, их компилятор выбрасывает, поэтому маркеры читаются из СЫРОГО
 * текста: строка прямо над сайтом.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";

import ts from "typescript";

import { listSourceFiles, ROOT, SRC } from "@/lib/testing/client-graph";
import { parseSource } from "@/lib/testing/prisma-calls";

export const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

// ---------------------------------------------------------------- сырые теги

export const RAW_TAGS = ["button", "input", "select", "textarea"] as const;
export type RawTag = (typeof RAW_TAGS)[number];
export type RawCounts = Partial<Record<RawTag, number>>;

export type MarkerProblem = { line: number; problem: string };
export type RawScan = { counts: RawCounts; sites: { tag: RawTag; line: number }[]; markers: MarkerProblem[] };

const RAW_SET = new Set<string>(RAW_TAGS);
// Маркер — только в комментарии (`//` или `/*`, в JSX — `{/* … */}`): упоминание в
// прозе JSDoc и в самих регулярках маркером не считается.
const RAW_MARKER = /(?:\/\/|\/\*)\s*raw-control-ok:(.*)$/;
const DARK_MARKER = /(?:\/\/|\/\*)\s*dark-ok:(.*)$/;

/** Причина маркера без хвоста JSX-комментария (`*\/}`) и пробелов. */
function markerReason(tail: string): string {
  return tail.replace(/\*\/\s*\}?\s*$/, "").trim();
}

/** Строки-маркеры файла: номер строки (1-based) → причина. */
function readMarkers(text: string, pattern: RegExp): Map<number, string> {
  const out = new Map<number, string>();
  text.split("\n").forEach((line, index) => {
    const match = pattern.exec(line.replace(/\r$/, ""));
    if (match) out.set(index + 1, markerReason(match[1] ?? ""));
  });
  return out;
}

/** Имя сырого тега (`button`, `motion.button`, `m.input` → базовое имя) или null. */
function rawTagName(tag: ts.JsxTagNameExpression): RawTag | null {
  if (ts.isIdentifier(tag) && RAW_SET.has(tag.text)) return tag.text as RawTag;
  if (ts.isPropertyAccessExpression(tag) && RAW_SET.has(tag.name.text)) return tag.name.text as RawTag;
  return null;
}

/**
 * Сырые теги файла. Сайт под маркером `raw-control-ok: <причина>` в счёт не
 * идёт; маркер без причины или без сырого тега строкой ниже — проблема.
 */
export function scanRawControls(file: string, text: string): RawScan {
  const sf = parseSource(file, text);
  const sites: { tag: RawTag; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = rawTagName(node.tagName);
      if (name) sites.push({ tag: name, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const markers = readMarkers(text, RAW_MARKER);
  const problems: MarkerProblem[] = [];
  const counts: RawCounts = {};
  const siteLines = new Set(sites.map((s) => s.line));
  for (const [line, reason] of markers) {
    if (!reason) problems.push({ line, problem: "маркер raw-control-ok без причины" });
    if (!siteLines.has(line + 1)) problems.push({ line, problem: "маркер raw-control-ok без сырого тега строкой ниже" });
  }
  for (const site of sites) {
    const reason = markers.get(site.line - 1);
    if (reason) continue;
    counts[site.tag] = (counts[site.tag] ?? 0) + 1;
  }
  return { counts, sites, markers: problems };
}

/** Область сторожа сырых тегов: `.tsx` в `src/`, кроме примитивов и тестов. */
export function rawControlFiles(): string[] {
  return listSourceFiles(SRC)
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => !rel(file).startsWith("src/components/ui/"));
}

// ------------------------------------------------------------ dark и палитра

export type DarkCounts = { dark?: number; palette?: number };
export type DarkScan = { counts: DarkCounts; markers: MarkerProblem[] };

/** `dark:` в любой позиции варианта и обходные формы тёмной темы. */
export const DARK_PATTERN =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:dark:|\[\.dark[_ ]&\]:|group-\[\.dark\]:|data-\[theme=dark\]:)/g;
/** Утилита цвета из палитры Tailwind (`text-red-600`, `hover:bg-emerald-50/40`). */
export const PALETTE_PATTERN =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline)-(?:emerald|green|lime|teal|amber|yellow|orange|red|rose|pink|blue|sky|indigo|violet|purple|fuchsia|slate|zinc|gray|neutral|stone)-\d{2,3}(?![\w-])/g;

function isStringish(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

/**
 * `dark`- и `palette`-утилиты в строковых литералах файла. Строка под маркером
 * `dark-ok: <причина>` в счёт не идёт; маркер без причины или без `dark:`/палитры
 * строкой ниже — проблема.
 */
export function scanDarkOverrides(file: string, text: string): DarkScan {
  const sf = parseSource(file, text);
  const hits: { kind: "dark" | "palette"; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (isStringish(node)) {
      const start = node.getStart(sf);
      const raw = text.slice(start, node.getEnd());
      for (const [kind, pattern] of [
        ["dark", DARK_PATTERN],
        ["palette", PALETTE_PATTERN],
      ] as const) {
        for (const match of raw.matchAll(pattern)) {
          hits.push({ kind, line: sf.getLineAndCharacterOfPosition(start + (match.index ?? 0)).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const markers = readMarkers(text, DARK_MARKER);
  const problems: MarkerProblem[] = [];
  const hitLines = new Set(hits.map((h) => h.line));
  for (const [line, reason] of markers) {
    if (!reason) problems.push({ line, problem: "маркер dark-ok без причины" });
    if (!hitLines.has(line + 1)) problems.push({ line, problem: "маркер dark-ok без тёмной вилки или палитры строкой ниже" });
  }
  const counts: DarkCounts = {};
  for (const hit of hits) {
    if (markers.get(hit.line - 1)) continue;
    counts[hit.kind] = (counts[hit.kind] ?? 0) + 1;
  }
  return { counts, markers: problems };
}

/** Область сторожа `dark:`/палитры: `.ts`/`.tsx` в `src/`, кроме тестов. */
export function darkOverrideFiles(): string[] {
  return listSourceFiles(SRC);
}

// ----------------------------------------------------------------- сверка

export type Inventory<C extends Record<string, number | undefined>> = Record<string, C>;

function nonEmpty(counts: Record<string, number | undefined>): boolean {
  return Object.values(counts).some((n) => (n ?? 0) > 0);
}

/** Текущий инвентарь (только файлы с ненулевым счётом) и проблемы маркеров. */
export function collect<C extends Record<string, number | undefined>>(
  files: string[],
  scan: (file: string, text: string) => { counts: C; markers: MarkerProblem[] },
): { inventory: Inventory<C>; markerProblems: string[] } {
  const inventory: Inventory<C> = {};
  const markerProblems: string[] = [];
  for (const file of files) {
    const name = rel(file);
    const result = scan(name, readFileSync(file, "utf8"));
    if (nonEmpty(result.counts)) inventory[name] = result.counts;
    for (const m of result.markers) markerProblems.push(`${name}:${m.line} — ${m.problem}`);
  }
  return { inventory, markerProblems };
}

/**
 * Дельта против замороженного инвентаря: новый файл, рост, снижение (просьба
 * обновить FROZEN — ремедиация фиксируется в стороже) и пропавший файл.
 */
export function diffInventory<C extends Record<string, number | undefined>>(
  frozen: Inventory<C>,
  current: Inventory<C>,
  keys: readonly string[],
): string[] {
  const out: string[] = [];
  const fmt = (c: Record<string, number | undefined>) =>
    keys.filter((k) => (c[k] ?? 0) > 0).map((k) => `${k} ${c[k]}`).join(", ");
  for (const [file, counts] of Object.entries(current)) {
    const was = frozen[file];
    if (!was) {
      out.push(`${file}: новый файл в инвентаре — ${fmt(counts)}`);
      continue;
    }
    for (const key of keys) {
      const before = (was as Record<string, number | undefined>)[key] ?? 0;
      const now = (counts as Record<string, number | undefined>)[key] ?? 0;
      if (now > before) out.push(`${file}: ${key} ${before} → ${now}`);
      if (now < before) out.push(`${file}: обновите FROZEN — ${key} было ${before}, стало ${now}`);
    }
  }
  for (const file of Object.keys(frozen)) {
    if (!current[file]) out.push(`${file}: в инвентаре больше ничего нет — удалите строку из FROZEN`);
  }
  return out;
}
