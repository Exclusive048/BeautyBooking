/**
 * 29.09 доработки · 12 (CN-MERGE-PROPOSAL) — инвентарь конфликтов утилит.
 *
 * Инструмент, не гейт: `npx tsx scripts/inventory-cn-conflicts.ts [--loose] [--out файл]`.
 * Прошлый скрипт CN-CONFLICT-CLASS жил только в отчёте и потерялся — этот в
 * репозитории, чтобы разбор можно было повторить.
 *
 * Что считает. Для каждого JSX-вызова примитива из `src/components/ui/` с
 * ЛИТЕРАЛЬНЫМ `className` (и литеральными `variant`/`size`) примитив
 * рендерится (`react-dom/server`) с меткой вместо `className` — так видны ВСЕ
 * его классы (после переключения `cn` сам выбрасывает дефолт, уступивший
 * вызывающему, и из рендера с настоящим `className` конфликт уже не прочесть),
 * — и `tailwind-merge` 2.x решает, какие из них конфликтуют с классами
 * вызывающего. Конфликт «живой», если при плоском join побеждал дефолт
 * примитива — его правило в собранном бандле стоит ПОЗЖЕ правила вызывающего;
 * после переключения на tailwind-merge такие места выглядят иначе, чем раньше.
 * «Латентный» — вызывающий побеждал и так, картинка не менялась. Отдельно —
 * конфликты внутри одного `cn("…", "…")` с литеральными аргументами.
 *
 * `--loose`: вызовы, у которых `className`/`variant` — выражение, тоже
 * разбираются: классами вызывающего считается объединение ВСЕХ строковых
 * литералов выражения (ветки тернария, аргументы `cn`), варианты — все
 * литералы-имена вариантов. Это надмножество: пара из взаимоисключающих веток
 * даёт ложный конфликт, поэтому такие находки помечены `≈` и читаются глазами.
 * Классы из переменных вне выражения не видны и так.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { extendTailwindMerge } from "tailwind-merge";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Textarea } from "@/components/ui/textarea";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Те же расширения, что в `src/lib/cn.ts` после переключения (иначе тени и
// градиенты проекта читались бы как цвета и дали бы ложные конфликты).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["soft", "card", "hover", "glow", "brand"] }],
      "bg-image": [{ bg: ["brand-gradient", "brand-gradient-soft"] }],
    },
  },
});

const PRIMITIVES: Record<string, ComponentType<Record<string, unknown>>> = {
  Button: Button as ComponentType<Record<string, unknown>>,
  Input: Input as ComponentType<Record<string, unknown>>,
  Badge: Badge as ComponentType<Record<string, unknown>>,
  Select: Select as ComponentType<Record<string, unknown>>,
  Textarea: Textarea as unknown as ComponentType<Record<string, unknown>>,
  Card: Card as ComponentType<Record<string, unknown>>,
  CardHeader: CardHeader as ComponentType<Record<string, unknown>>,
  CardContent: CardContent as ComponentType<Record<string, unknown>>,
  Skeleton: Skeleton as ComponentType<Record<string, unknown>>,
  StatTile: StatTile as unknown as ComponentType<Record<string, unknown>>,
};

// ---------- бандл: номер строки первого правила класса ----------

function buildBundle(): string[] {
  const dir = mkdtempSync(join(tmpdir(), "cn-inv-"));
  const out = join(dir, "out.css");
  execFileSync(
    process.execPath,
    [join(ROOT, "node_modules/tailwindcss/lib/cli.js"), "-c", "tailwind.config.js", "-i", "src/app/globals.css", "-o", out],
    { cwd: ROOT, stdio: "ignore" },
  );
  return readFileSync(out, "utf8").split("\n");
}

function cssEscape(cls: string): string {
  return cls.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function makeLineOf(lines: string[]) {
  const cache = new Map<string, number>();
  return (cls: string): number => {
    const hit = cache.get(cls);
    if (hit !== undefined) return hit;
    const needle = `.${cssEscape(cls)}`;
    let found = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const at = lines[i].indexOf(needle);
      if (at === -1) continue;
      const next = lines[i][at + needle.length];
      if (next === undefined || /[\s:{,.>)[]/.test(next)) {
        found = i + 1;
        break;
      }
    }
    cache.set(cls, found);
    return found;
  };
}

// ---------- исходники ----------

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

/** Текст пропсов открывающего тега от `<Name` до закрывающего `>` вне скобок и строк. */
function readTag(code: string, from: number): string | null {
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i += 1;
      while (i < code.length && code[i] !== q) {
        if (code[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return code.slice(from, i);
  }
  return null;
}

function literalProp(tag: string, name: string): string | null | undefined {
  const re = new RegExp(`\\b${name}=(?:"([^"]*)"|\\{"([^"]*)"\\}|\\{\`([^\`$]*)\`\\})`);
  const m = re.exec(tag);
  if (m) return m[1] ?? m[2] ?? m[3] ?? "";
  if (new RegExp(`\\b${name}=`).test(tag)) return null; // выражение — не разбираем
  return undefined; // пропа нет
}

// ---------- разбор ----------

type Finding = { kind: "live" | "latent"; where: string; what: string; base: string; caller: string; lines: string };

const SENTINEL = "qa-inventory-sentinel";
const BUTTON_VARIANTS = new Set(["primary", "secondary", "ghost", "danger", "icon", "wrapper", "inverted"]);
const BADGE_VARIANTS = new Set(["default", "success", "warning", "danger", "info", "muted"]);

/** Текст выражения пропа `name={…}` (с учётом вложенных скобок и строк). */
function expressionProp(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}=\\{`).exec(tag);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < tag.length && depth > 0; i += 1) {
    const ch = tag[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i += 1;
      while (i < tag.length && tag[i] !== q) {
        if (tag[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  return tag.slice(start, i - 1);
}

/** Аргументы вызова верхнего уровня (запятые вне скобок и строк). */
function splitTopLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i += 1;
      while (i < args.length && args[i] !== q) {
        if (args[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(args.slice(from, i));
      from = i + 1;
    }
  }
  out.push(args.slice(from));
  return out.filter((a) => a.trim());
}

/** Все строковые литералы выражения (без `${…}`-шаблонов). */
function stringLiterals(expr: string): string[] {
  return [...expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** Классы примитива при данных `variant`/`size` — рендер с меткой вместо `className`. */
function baseClassesOf(name: string, Comp: ComponentType<Record<string, unknown>>, tag: string, variant: string | undefined, size: string | undefined): string[] | null {
  const props: Record<string, unknown> = { className: SENTINEL };
  if (variant) props.variant = variant;
  if (size) props.size = size;
  if (/\basChild\b/.test(tag)) {
    props.asChild = true;
    props.children = createElement("a", { href: "#" }, "x");
  } else if (name === "Select") {
    props.children = createElement("option", { value: "x" }, "x");
  } else if (name === "StatTile") {
    props.label = "x";
    props.value = "1";
  } else if (name !== "Input" && name !== "Textarea" && name !== "Skeleton") {
    props.children = "x";
  }
  let markup: string;
  try {
    markup = renderToStaticMarkup(createElement(Comp, props));
  } catch {
    return null;
  }
  const attr = [...markup.matchAll(/class="([^"]*)"/g)]
    .map((a) => a[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'))
    .find((c) => c.split(/\s+/).includes(SENTINEL));
  if (!attr) return null;
  return attr.split(/\s+/).filter((c) => c && c !== SENTINEL);
}

function conflictsOf(base: string[], caller: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const b of base) {
    for (const c of caller) {
      if (b === c) continue;
      if (twMerge(`${b} ${c}`) === c) pairs.push([b, c]);
    }
  }
  return pairs;
}

function main() {
  const outArg = process.argv.indexOf("--out");
  const outFile = outArg !== -1 ? process.argv[outArg + 1] : null;
  const loose = process.argv.includes("--loose");
  const lineOf = makeLineOf(buildBundle());
  const findings: Finding[] = [];
  let dynamicSites = 0;
  let looseSites = 0;
  let analysedSites = 0;
  let dynamicCnArgs = 0;

  for (const file of listSources(SRC)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel.startsWith("src/components/ui/")) continue;
    const raw = readFileSync(file, "utf8");
    const code = stripComments(raw);
    const lineAt = (idx: number) => code.slice(0, idx).split("\n").length;

    for (const [name, Comp] of Object.entries(PRIMITIVES)) {
      const re = new RegExp(`<${name}(?=[\\s/>])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const tag = readTag(code, m.index + name.length + 1);
        if (tag === null) continue;
        const className = literalProp(tag, "className");
        if (className === undefined) continue;
        const variant = literalProp(tag, "variant");
        const size = literalProp(tag, "size");
        const dynamic = className === null || variant === null || size === null;
        if (dynamic) {
          dynamicSites += 1;
          if (!loose || size === null) continue;
        }
        const callerTokens =
          className === null
            ? stringLiterals(expressionProp(tag, "className") ?? "").flatMap((lit) => lit.split(/\s+/))
            : className.split(/\s+/);
        const caller = [...new Set(callerTokens.filter((t) => t && /^[a-z!-]/.test(t)))];
        if (caller.length === 0) continue;
        const allowed = name === "Badge" ? BADGE_VARIANTS : BUTTON_VARIANTS;
        const variants =
          variant === null
            ? [...new Set(stringLiterals(expressionProp(tag, "variant") ?? "").filter((v) => allowed.has(v)))]
            : [variant];
        if (variants.length === 0) continue;
        if (dynamic) looseSites += 1;
        else analysedSites += 1;
        for (const v of variants) {
          const base = baseClassesOf(name, Comp, tag, v, size ?? undefined);
          if (!base) continue;
          for (const [b, c] of conflictsOf(base, caller)) {
            const lb = lineOf(b);
            const lc = lineOf(c);
            findings.push({
              kind: lb > lc ? "live" : "latent",
              where: `${rel}:${lineAt(m.index)}`,
              what: `${dynamic ? "≈ " : ""}<${name}${v ? ` variant=${v}` : ""}${size ? ` size=${size}` : ""}>`,
              base: b,
              caller: c,
              lines: `${lb} vs ${lc}`,
            });
          }
        }
      }
    }

    // конфликты внутри ОДНОЙ строки классов (className="…" или аргумент cn):
    // сегодня их решает бандл, после переключения — порядок в строке. Сюда же
    // попадает `leading-*` перед размером шрифта: поздний `text-sm` в Tailwind 3
    // задаёт и высоту строки, и библиотека выбрасывает ранний `leading-*`.
    const strRe = /(?:className=|cn\(|,)\s*["`]([^"`$]*\s[^"`$]*)["`]/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(code))) {
      const tokens = sm[1].split(/\s+/).filter(Boolean);
      if (tokens.length < 2 || !tokens.some((t) => /^[a-z!-]/.test(t))) continue;
      for (let a = 0; a < tokens.length; a += 1) {
        for (let b = a + 1; b < tokens.length; b += 1) {
          if (twMerge(`${tokens[a]} ${tokens[b]}`) !== tokens[b]) continue;
          const la = lineOf(tokens[a]);
          const lb = lineOf(tokens[b]);
          findings.push({
            kind: la > lb ? "live" : "latent",
            where: `${rel}:${lineAt(sm.index)}`,
            what: "одна строка",
            base: tokens[a],
            caller: tokens[b],
            lines: `${la} vs ${lb}`,
          });
        }
      }
    }

    // конфликты внутри одного cn("…", "…")
    const cnRe = /\bcn\(/g;
    let c: RegExpExecArray | null;
    while ((c = cnRe.exec(code))) {
      let depth = 1;
      let i = c.index + 3;
      for (; i < code.length && depth > 0; i += 1) {
        if (code[i] === "(") depth += 1;
        else if (code[i] === ")") depth -= 1;
      }
      const args = code.slice(c.index + 3, i - 1);
      const conditional = /&&|\?/.test(args);
      if (conditional) dynamicCnArgs += 1;
      // Строгий режим — только литеральные аргументы. `--loose` — каждый
      // аргумент верхнего уровня даёт набор альтернатив (ветки тернария,
      // `cond && "…"`), и сравниваются альтернативы РАЗНЫХ аргументов: ветки
      // одного аргумента взаимоисключающие и конфликтом не считаются.
      const groups: string[][] = loose
        ? splitTopLevel(args).map((arg) => stringLiterals(arg))
        : [...args.matchAll(/(?:^|,)\s*"([^"]*)"\s*(?=,|$)/g)].map((a) => [a[1]]);
      for (let a = 0; a < groups.length; a += 1) {
        for (let b = a + 1; b < groups.length; b += 1) {
          for (const earlyLit of groups[a]) {
            for (const lateLit of groups[b]) {
              const early = earlyLit.split(/\s+/).filter(Boolean);
              const late = lateLit.split(/\s+/).filter(Boolean);
              for (const [e, l] of conflictsOf(early, late)) {
                const le = lineOf(e);
                const ll = lineOf(l);
                findings.push({
                  kind: le > ll ? "live" : "latent",
                  where: `${rel}:${lineAt(c.index)}`,
                  what: groups[a].length > 1 || groups[b].length > 1 || conditional ? "≈ cn(…)" : "cn(…)",
                  base: e,
                  caller: l,
                  lines: `${le} vs ${ll}`,
                });
              }
            }
          }
        }
      }
    }
  }

  const live = findings.filter((f) => f.kind === "live");
  const latent = findings.filter((f) => f.kind === "latent");
  const text = [
    `Разобрано JSX-вызовов с литеральным className: ${analysedSites}; с выражениями: ${dynamicSites} (разобрано --loose: ${looseSites}); cn(…) с условными аргументами: ${dynamicCnArgs}`,
    `Живых конфликтов: ${live.length}; латентных: ${latent.length}`,
    "",
    "## Живые (сегодня побеждает дефолт; строка бандла дефолта > строки вызывающего)",
    ...live.map((f) => `${f.where}  ${f.what}  ${f.base} ⟶ ${f.caller}  (${f.lines})`),
    "",
    "## Латентные",
    ...latent.map((f) => `${f.where}  ${f.what}  ${f.base} ⟶ ${f.caller}  (${f.lines})`),
    "",
  ].join("\n");
  if (outFile) writeFileSync(outFile, text);
  process.stdout.write(text);
}

main();
