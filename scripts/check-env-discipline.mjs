#!/usr/bin/env node
/**
 * SEC-14 — гейт правила 11: переменные окружения читаются только через
 * `src/lib/env.ts`.
 *
 * ## Зачем
 *
 * Правило 11 существует с ENV-DISCIPLINE и до сих пор держалось **только на
 * дисциплине ревьюера**: в `npm run check` не было ни одного шага, который бы
 * его проверял (`ls scripts/` не содержал `check-env*`). Аудит нашёл четыре
 * живых нарушения в `src/lib/telegram/config.ts`, и все четыре были невидимы
 * для обычного грепа, потому что использовали СКОБОЧНУЮ нотацию:
 *
 *     process.env[BOT_TOKEN_ENV]      ← `grep "process\.env\."` это не находит
 *
 * Цена промаха там была не абстрактной: опечатка в имени
 * `TELEGRAM_WEBHOOK_SECRET` даёт `null`, а вебхук трактует `null` как «секрет
 * не настроен» и пропускает весь блок проверки подлинности.
 *
 * ## Что ловим
 *
 * Обе нотации — `process.env.NAME` и `process.env["NAME"]` / `process.env[VAR]`
 * — во всём `src/`, кроме файлов из списка исключений CLAUDE.md rule 11.
 *
 * ## Исключения
 *
 * Список ниже — дословный перенос из CLAUDE.md rule 11. Он намеренно короткий
 * и состоит из ТОЧНЫХ путей, а не паттернов: паттерн вроде `**\/config.ts`
 * завтра молча разрешит новый файл. `src/instrumentation.ts` разрешён только
 * для `NEXT_RUNTIME` — это build-time литерал, на котором держится
 * dead-code-elimination edge-ветки; остальные env там обязаны идти через
 * `env.ts`.
 *
 * ## Что делать, если правило мешает
 *
 * Почти всегда правильный ответ — добавить переменную в Zod-схему `env.ts`.
 * Расширять список исключений можно только вместе с объяснением в CLAUDE.md:
 * список тут и правило там обязаны совпадать, иначе гейт начнёт врать.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/** Точные пути (от корня репозитория), которым `process.env` разрешён. */
const ALLOWED_FILES = new Set([
  "src/lib/env.ts",
  // ENV-SPLIT-01: фронт-половина env — NEXT_PUBLIC_* обязаны быть ЛИТЕРАЛАМИ
  // `process.env.X`, иначе webpack их не инлайнит (QA-001/FIX-09).
  "src/lib/env.client.ts",
  "src/lib/prisma.ts",
  "src/lib/prisma-direct.ts",
  "src/lib/startup.ts",
  "src/proxy.ts",
]);

/** Файлы с ограниченным разрешением: только перечисленные переменные. */
const ALLOWED_VARS_BY_FILE = new Map([["src/instrumentation.ts", new Set(["NEXT_RUNTIME"])]]);

const DIRECT = /process\.env\.([A-Za-z_$][\w$]*)/g;
const BRACKET = /process\.env\[\s*(?:["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*))\s*\]/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx|mts|cts)$/.test(entry)) out.push(full);
  }
  return out;
}

function isTestFile(rel) {
  return /\.test\.(ts|tsx)$/.test(rel) || rel.startsWith("src/test/");
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (ALLOWED_FILES.has(rel) || isTestFile(rel)) continue;

  const allowedVars = ALLOWED_VARS_BY_FILE.get(rel);
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    // Комментарии правило не нарушают — они ничего не читают.
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;

    for (const re of [DIRECT, BRACKET]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        const name = match[1] ?? match[2] ?? "<computed>";
        if (allowedVars?.has(name)) continue;
        violations.push({ rel, line: index + 1, name, text: trimmed.slice(0, 120) });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("ENV-DISCIPLINE: нарушения правила 11 — process.env мимо src/lib/env.ts\n");
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  ${v.name}`);
    console.error(`    ${v.text}`);
  }
  console.error(
    `\nВсего: ${violations.length}. Добавьте переменную в Zod-схему src/lib/env.ts и читайте через \`env\`.`,
  );
  console.error(
    "Скобочная нотация `process.env[VAR]` — то же нарушение: она лишь прячет его от грепа.",
  );
  process.exit(1);
}

console.log(
  `ENV-DISCIPLINE: OK — ${ALLOWED_FILES.size} файлов-исключений + ${ALLOWED_VARS_BY_FILE.size} с ограниченным разрешением; обе нотации (точечная и скобочная) проверены.`,
);
