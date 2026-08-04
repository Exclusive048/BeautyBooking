#!/usr/bin/env node
/**
 * ERR-LOCALIZATION-01 — гейт против английских сообщений об ошибках,
 * покидающих сервер к пользователю.
 *
 * ## Что ловим
 *
 * `AppError.message` и первый аргумент `fail()` уезжают в тело ответа
 * (`response.ts`: `error: { message, code, details }`), а ~28 UI-сайтов
 * рендерят его напрямую (`body?.error?.message ?? fallback`). Значит любая
 * английская строка в `new AppError("Booking not found", …)` — это «Booking
 * not found» посреди русского интерфейса. Класс подтверждён живьём дважды
 * (F3 «Comment is required», F6 «Limit reached»).
 *
 * ## Инвариант
 *
 * Любое сообщение, покидающее сервер через `fail()` / `new AppError()` /
 * `tooManyRequests()`, — курируемая русская строка. Стиль — CLAUDE.md:
 * «Не удалось {действие}. Попробуйте ещё раз.», для валидации — конкретика.
 *
 * Проверка простая и намеренно грубая: в строковом литерале должна быть
 * кириллица. Это ловит именно тот класс, ради которого гейт написан
 * (забыли перевести), и не пытается быть лингвистом.
 *
 * ## Что делать, если строка законно не по-русски
 *
 * Вписать её ТОЧНЫМ текстом в `scripts/error-message-allowlist.txt` с
 * причиной. Паттернов нет намеренно: точная строка не расширяет разрешение
 * молча. **Пустой allowlist лучше раздутого** — сомнение трактуется в
 * пользу перевода.
 *
 * ## Два канала (второй найден при аудите и чуть не остался дырой)
 *
 * 1. **Прямой** — литерал в `new AppError(…)` / `fail(…)` / `tooManyRequests(…)`.
 * 2. **Через объект-результат** — `return { ok: false, status, message: "…",
 *    code }`, который роут отдаёт как `fail(result.message, …)`. Здесь первый
 *    аргумент `fail()` — переменная, и правило №1 такой сайт НЕ видит. На
 *    момент написания гейта этим каналом уезжало 90 английских сообщений
 *    (`schedule/usecases.ts`, `bookings/usecases.ts`, `providers/services.ts`,
 *    `invites/service.ts` и др.) — то есть гейт без второго правила был бы
 *    зелёным при живой утечке.
 *
 *    Признак «это ошибка, а не произвольный `message:`» — соседство с
 *    `code:` (SCREAMING_SNAKE), `ok: false` или `status: <3 цифры>` в пределах
 *    ±250 символов. Эвристика намеренно смещена в сторону ложных
 *    срабатываний: лишний перевод стоит дёшево, пропущенная утечка — нет.
 *
 * ## Границы
 *
 * - Тест-файлы (`*.test.ts(x)`) не проверяются: они конструируют ошибки как
 *   фикстуры, пользователю такие строки не показываются.
 * - Нелитеральный первый аргумент (`fail(err.message, …)`, переменная,
 *   тернарник) статически не судится — такие сайты считаются и печатаются
 *   в отчёте (`--report`), но не валят гейт: их корректность определяется
 *   источником строки, а не этим вызовом.
 * - Шаблонные литералы проверяются по статическим частям: `Лимит ${n}` — ок.
 *
 * Запуск: `node scripts/check-error-message-lang.mjs [--report]`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWLIST_FILE = join(ROOT, "scripts", "error-message-allowlist.txt");
const REPORT = process.argv.includes("--report");

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Вызовы, чей строковый аргумент уезжает в тело ответа.
 *
 * 🚩 Позиция сообщения РАЗНАЯ, и это не мелочь: в проекте живут ДВА `fail`
 * с несовместимыми сигнатурами — `api/response.ts` `fail(message, status, code)`
 * и `api/contracts.ts` `fail(status, message, code)` (+ `jsonFail` с той же
 * второй формой, 613 сайтов). Гейт, знающий только «сообщение — первый
 * аргумент», молча пропустил бы весь второй лагерь: там первым идёт число,
 * литерал не читается, и сайт уходит в «нелитеральные». Именно так живая
 * проба поймала английский «Validation error» на `POST /api/public/bookings`
 * уже после «зелёного» первого прохода.
 *
 * Поэтому позиция не задаётся, а ВЫВОДИТСЯ: сообщение — первый строковый
 * литерал среди первых двух аргументов (статус/секунды всегда числовые).
 * Код ошибки — третий аргумент, до него разбор не доходит по построению.
 */
const CALLS = ["new AppError(", "fail(", "jsonFail(", "tooManyRequests(", "validationError("];
const MESSAGE_ARG_SCAN_DEPTH = 2;

/**
 * Правило 4 — «фабрику ошибок нельзя завести молча».
 *
 * `validationError()` в `lib/validation/index.ts` — локальная обёртка над
 * `new AppError(message, …)`. Её вызовы правилам 1–3 не видны (они знают имена
 * из `CALLS`), а именно там жил самый достижимый английский текст в приложении:
 * «Validation error» на КАЖДОМ провале Zod-разбора во всех ~290 роутах. Нашла
 * его живая проба, а не статический проход — и это ровно тот способ, которым
 * гейт «зелёный, но дырявый» и живёт.
 *
 * Поэтому гейт ищет сам паттерн обёртки: функция, принимающая `message` и
 * конструирующая из него `AppError`/`fail`. Найденная и не перечисленная в
 * `CALLS` — нарушение с просьбой её зарегистрировать. Следующую такую обёртку
 * найдёт гейт, а не пользователь на проде.
 */
const FACTORY = /function\s+(\w+)\s*\(\s*(?:message|msg)\b[^)]*\)[\s\S]{0,300}?(?:new AppError\(\s*(?:message|msg)\b|\bfail\(\s*(?:message|msg)\b|jsonFail\([^,]+,\s*(?:message|msg)\b)/g;

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

function loadAllowlist() {
  let raw = "";
  try {
    raw = readFileSync(ALLOWLIST_FILE, "utf8");
  } catch {
    return new Set();
  }
  const entries = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    entries.add(trimmed);
  }
  return entries;
}

/**
 * Читает строковый литерал, начинающийся в позиции `start`.
 * Возвращает { value, end } либо null, если там не литерал.
 * Для шаблонных литералов value — сырое содержимое вместе с `${…}`.
 */
function readStringLiteral(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let i = start + 1;
  let value = "";
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      value += ch + source[i + 1];
      i += 2;
      continue;
    }
    if (quote === "`") {
      if (ch === "$" && source[i + 1] === "{") depth += 1;
      if (ch === "}" && depth > 0) depth -= 1;
    }
    if (ch === quote && depth === 0) return { value, end: i + 1 };
    value += ch;
    i += 1;
  }
  return null;
}

/** Пропускает пробелы, переводы строк и комментарии. */
function skipTrivia(source, i) {
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    return i;
  }
  return i;
}

/** Пропускает один аргумент до запятой верхнего уровня. Возвращает позицию после запятой. */
function skipArgument(source, i) {
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return -1;
      depth -= 1;
    } else if (ch === "," && depth === 0) return i + 1;
    i += 1;
  }
  return -1;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

const allowlist = loadAllowlist();
const files = listFiles(SRC);

const violations = [];
const localized = [];
const unresolved = [];
const allowed = [];
const unregisteredFactories = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");

  for (const pattern of CALLS) {
    let from = 0;
    while (true) {
      const at = source.indexOf(pattern, from);
      if (at === -1) break;
      from = at + pattern.length;

      // `fail(` не должен ловить `…Fail(` / `onFail(` и т.п. (`jsonFail(` — свой паттерн).
      if (pattern === "fail(") {
        const before = source[at - 1];
        if (before && /[A-Za-z0-9_$.]/.test(before)) continue;
      }

      // Ищем первый строковый литерал среди первых двух аргументов.
      let i = skipTrivia(source, at + pattern.length);
      let literal = null;
      let messageArgStart = i;
      for (let arg = 0; arg < MESSAGE_ARG_SCAN_DEPTH; arg += 1) {
        messageArgStart = i;
        literal = readStringLiteral(source, i);
        if (literal) break;
        const next = skipArgument(source, i);
        if (next === -1) break;
        i = skipTrivia(source, next);
      }
      i = messageArgStart;
      const site = { file: rel, line: lineOf(source, at), call: pattern.replace("(", "") };

      if (!literal) {
        // Правило 3: аргумент — выражение, но внутри него может прятаться
        // fallback-литерал: `message ?? "Too many requests"`, `err.message ||
        // "Internal error"`. Именно так уезжали дефолтные 429 и 500 — литерал
        // есть, но не в начале аргумента, и правило 1 его не видит.
        const argEnd = skipArgument(source, i);
        const argText = source.slice(i, argEnd === -1 ? i : argEnd - 1);
        const fallbacks = argText.match(/(?:\?\?|\|\|)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g) ?? [];
        for (const raw of fallbacks) {
          const message = raw.replace(/^(?:\?\?|\|\|)\s*/, "").slice(1, -1);
          const fallbackSite = { ...site, call: `${site.call} (fallback)` };
          if (CYRILLIC.test(message)) localized.push({ ...fallbackSite, message });
          else if (allowlist.has(message)) allowed.push({ ...fallbackSite, message });
          else violations.push({ ...fallbackSite, message });
        }
        unresolved.push({ ...site, snippet: source.slice(i, i + 60).split("\n")[0].trim() });
        continue;
      }
      const message = literal.value;
      if (CYRILLIC.test(message)) {
        localized.push({ ...site, message });
      } else if (allowlist.has(message)) {
        allowed.push({ ...site, message });
      } else {
        violations.push({ ...site, message });
      }
    }
  }

  // ── Правило 4: незарегистрированная фабрика ошибок ──────────────────────
  FACTORY.lastIndex = 0;
  let factory;
  while ((factory = FACTORY.exec(source))) {
    const name = factory[1];
    if (CALLS.includes(`${name}(`)) continue;
    unregisteredFactories.push({ file: rel, line: lineOf(source, factory.index), name });
  }

  // ── Правило 2: сообщение в объекте-результате ошибки ────────────────────
  const objectMessage = /message:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;
  while ((match = objectMessage.exec(source))) {
    const around = source.slice(Math.max(0, match.index - 250), match.index + 250);
    const isErrorShape =
      /\bcode:\s*["'`A-Z_]/.test(around) ||
      /\bok:\s*false/.test(around) ||
      /\bstatus:\s*\d{3}/.test(around);
    if (!isErrorShape) continue;

    const message = match[1].slice(1, -1);
    const site = { file: rel, line: lineOf(source, match.index), call: "result.message" };
    if (CYRILLIC.test(message)) localized.push({ ...site, message });
    else if (allowlist.has(message)) allowed.push({ ...site, message });
    else violations.push({ ...site, message });
  }

  // Правило 3b: fallback-литерал в СВОЙСТВЕ объекта — `message: message ?? "…"`.
  // Так жил дефолтный текст 429 в `tooManyRequests`: свойство есть, литерал
  // есть, но он не сразу после двоеточия — правила 2 и 3 оба мимо.
  const objectFallback = /message:\s*[^,\n}]*?(?:\?\?|\|\|)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let objFallback;
  while ((objFallback = objectFallback.exec(source))) {
    // Тот же признак «это ошибка», что и в правиле 2 — иначе под раздачу
    // попадают payload'ы логгера (`logError("…", { message: m ?? "(no message)" })`),
    // которые пользователю не показываются.
    const near = source.slice(Math.max(0, objFallback.index - 250), objFallback.index + 250);
    const isErrorShape =
      /\bcode:\s*["'`A-Z_]/.test(near) || /\bok:\s*false/.test(near) || /\bstatus:\s*\d{3}/.test(near);
    if (!isErrorShape) continue;

    const message = objFallback[1].slice(1, -1);
    const site = { file: rel, line: lineOf(source, objFallback.index), call: "message (fallback)" };
    if (CYRILLIC.test(message)) localized.push({ ...site, message });
    else if (allowlist.has(message)) allowed.push({ ...site, message });
    else violations.push({ ...site, message });
  }
}

if (REPORT) {
  const group = (rows) => {
    const byFile = new Map();
    for (const row of rows) {
      if (!byFile.has(row.file)) byFile.set(row.file, []);
      byFile.get(row.file).push(row);
    }
    return [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  };
  console.log(`# localized: ${localized.length}`);
  console.log(`# allowlisted: ${allowed.length}`);
  console.log(`# unresolved (non-literal arg): ${unresolved.length}`);
  console.log(`# VIOLATIONS: ${violations.length}\n`);
  for (const [file, rows] of group(violations)) {
    console.log(`${file}  (${rows.length})`);
    for (const row of rows) console.log(`  ${row.line}: [${row.call}] ${row.message}`);
  }
  process.exit(0);
}

if (unregisteredFactories.length > 0) {
  console.error(
    `ERROR-MESSAGE-LANG: найдена фабрика ошибок, не перечисленная в CALLS — её вызовы гейт не проверяет.\n`,
  );
  for (const row of unregisteredFactories) {
    console.error(`  ${row.file}:${row.line}  function ${row.name}(message, …) → AppError/fail`);
  }
  console.error(
    "\nПочинить: добавить \"<имя>(\" в массив CALLS в scripts/check-error-message-lang.mjs.\n" +
      "Так уже пряталось «Validation error» — самое достижимое сообщение в приложении.",
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    `ERROR-MESSAGE-LANG: ${violations.length} сообщени(й) об ошибке без кириллицы — они уезжают в UI как есть.\n`,
  );
  for (const row of violations) {
    console.error(`  ${row.file}:${row.line}  [${row.call}]  "${row.message}"`);
  }
  console.error(
    "\nПочинить: перевести на курируемую русскую строку (CLAUDE.md: «Не удалось {действие}. " +
      "Попробуйте ещё раз.»; для валидации — конкретика).\n" +
      "Если строка законно не по-русски (в UI не попадает) — вписать её ТОЧНЫМ текстом в " +
      "scripts/error-message-allowlist.txt с причиной.",
  );
  process.exit(1);
}

console.log(
  `ERROR-MESSAGE-LANG: OK — ${localized.length} сообщений локализовано, ` +
    `${allowed.length} в allowlist, ${unresolved.length} нелитеральных (не судятся).`,
);
