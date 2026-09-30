import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOTS = [
  "src/features/public-profile",
  "src/features/public-studio",
  "src/features/booking",
  "src/features/reviews",
  "src/features/media",
  "src/app/(public)/u/[username]/page.tsx",
];

const CYRILLIC_RE = /[А-Яа-яЁё]/;

/**
 * Blank out comment content so Cyrillic prose inside comments (JSDoc, block,
 * line, and JSX `{/* * /}` comments) is not flagged as a hardcoded UI string.
 * Tracks `/* ... * /` across lines so block-comment continuation lines (which
 * don't start with `*`) are stripped too. Conservative on the false-NEGATIVE
 * side: a `//` or `/*` inside a string literal would over-strip, but a Cyrillic
 * UI string sitting after such a sequence on the same line is not a real pattern
 * in this codebase. Returns the code-only portion of each line.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          i = line.length;
        } else {
          inBlock = false;
          i = end + 2;
        }
        continue;
      }
      const lineComment = line.indexOf("//", i);
      const blockStart = line.indexOf("/*", i);
      if (blockStart !== -1 && (lineComment === -1 || blockStart < lineComment)) {
        out += line.slice(i, blockStart);
        inBlock = true;
        i = blockStart + 2;
      } else if (lineComment !== -1) {
        out += line.slice(i, lineComment);
        i = line.length;
      } else {
        out += line.slice(i);
        i = line.length;
      }
    }
    return out;
  });
}

function collectFiles(rootPath) {
  const fullPath = resolve(rootPath);
  const stat = statSync(fullPath);
  if (stat.isFile()) return [fullPath];

  const files = [];
  const stack = [fullPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tsx")) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

const violations = [];

for (const root of ROOTS) {
  const files = collectFiles(root);
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    const rawLines = content.split("\n");
    const codeLines = stripComments(rawLines);
    for (let index = 0; index < codeLines.length; index += 1) {
      // Test the comment-stripped code; report the original line for context.
      if (!CYRILLIC_RE.test(codeLines[index])) continue;
      violations.push({
        filePath,
        line: index + 1,
        text: rawLines[index].trim().slice(0, 160),
      });
    }
  }
}

if (violations.length > 0) {
  console.error("UI text hardcode check failed. Move user-facing strings to src/lib/ui/text/<домен>.ts");
  for (const violation of violations) {
    console.error(`${violation.filePath}:${violation.line} ${violation.text}`);
  }
  process.exit(1);
}

/**
 * UI-21 — русская строка в ярлыке для вспомогательной технологии.
 *
 * Гейт выше смотрит ПЯТЬ публичных корней, поэтому в кабинетах, админке и
 * `src/components` правило 1 не действовало вовсе — там жили 32 хардкода в
 * `aria-label` / `placeholder` / `alt`. Их не видит ни один другой гейт: для
 * `lint` это строка, а глазами их не встретишь — половина ярлыков вообще не
 * отображается.
 *
 * Область — ВЕСЬ `src/`, но только эти четыре атрибута. Расширять первый гейт
 * на всё дерево нельзя: замер даёт **1108 срабатываний в 87 файлах**, из них
 * 470 — тексты правовых документов (`features/legal/content/*`) и ещё сотни —
 * маркетинговая проза лендингов. Это отдельная большая задача (заведена в
 * BACKLOG), и allowlist на 1100 строк не защищает, а маскирует.
 *
 * `title=` намеренно НЕ проверяется: в этом дереве это почти всегда проп
 * компонента (`ModalSurface`, `SectionHeader`, `LegalLayout`), а не HTML-атрибут,
 * и текстовая проверка их не различает — она немедленно упёрлась бы в ту же
 * прозу лендингов.
 */
const A11Y_ATTRIBUTES = ["aria-label", "aria-description", "placeholder", "alt"];

function collectTsxFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
        out.push(entryPath);
      }
    }
  }
  return out;
}

const a11yViolations = [];
for (const filePath of collectTsxFiles(resolve(process.cwd(), "src"))) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const attr of A11Y_ATTRIBUTES) {
      const asString = new RegExp(`${attr}=\\s*(["'])((?:[^"'\\\\]|\\\\.)*)\\1`).exec(line);
      if (asString && CYRILLIC_RE.test(asString[2])) {
        a11yViolations.push({ filePath, line: index + 1, text: line.trim().slice(0, 160) });
        continue;
      }
      const asTemplate = new RegExp(`${attr}=\\{\`([^\`]*)\``).exec(line);
      if (asTemplate && CYRILLIC_RE.test(asTemplate[1])) {
        a11yViolations.push({ filePath, line: index + 1, text: line.trim().slice(0, 160) });
      }
    }
  });
}

if (a11yViolations.length > 0) {
  console.error(
    "Русский текст в aria-label / placeholder / alt задан хардкодом. Перенесите в src/lib/ui/text/<домен>.ts:"
  );
  for (const violation of a11yViolations) {
    console.error(`${violation.filePath}:${violation.line} ${violation.text}`);
  }
  process.exit(1);
}

/**
 * UI-19 — многоточие в UI-строках только одним символом «…».
 *
 * Раскол был почти ровным (90 «…» против 88 «...») и доходил до прямых
 * коллизий на одном слове: «Загрузка…» рядом с «Загрузка...», «Отправляем…»
 * рядом с «Отправляем...». Ни один гейт этого не видел — для них обе формы
 * просто строка.
 *
 * Проверка держится ровно на этом одном символе и потому не требует реестра
 * исключений: три точки в русской UI-строке не бывают правильными. Ё-половина
 * находки сюда НЕ вынесена сознательно — там нужен словарь ударных форм
 * («сохранён» с ё, но «сохранены» без), а гейт со словарём наполовину хуже
 * отсутствующего.
 */
/**
 * 29.09 доработки · 18: тексты разложены по файлам доменов `src/lib/ui/text/*.ts`,
 * а `src/lib/ui/text.ts` — барель без единой строки. Читать только барель
 * значило бы проверять пустоту и оставаться зелёным при любом «...»; поэтому
 * набор файлов выводится из папки, пустой набор — отказ, а сама машинерия
 * перед прогоном проверяется на фикстуре (не-вакуумность — не по числу находок).
 */
const TEXT_DIR = "src/lib/ui/text";

function findEllipsis(source) {
  const found = [];
  source.split("\n").forEach((line, index) => {
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      if (match[1].includes("...")) found.push({ line: index + 1, value: match[1].slice(0, 80) });
    }
  });
  return found;
}

const FIXTURE = 'export const fixture = {\n  loading: "Загрузка...",\n  ok: "Загрузка…",\n} as const;\n';
const fixtureHits = findEllipsis(FIXTURE);
if (fixtureHits.length !== 1 || fixtureHits[0].line !== 2) {
  console.error("check:ui-text (UI-19): проверка многоточия не ловит «...» на фикстуре — машинерия сломана.");
  process.exit(1);
}

const textFiles = readdirSync(resolve(process.cwd(), TEXT_DIR))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => `${TEXT_DIR}/${name}`);
if (textFiles.length === 0) {
  console.error(`check:ui-text (UI-19): в ${TEXT_DIR} нет файлов доменов — это ошибка раскладки, а не чистота.`);
  process.exit(1);
}

const ellipsis = [];
for (const file of textFiles) {
  for (const row of findEllipsis(readFileSync(resolve(process.cwd(), file), "utf8"))) ellipsis.push({ file, ...row });
}

if (ellipsis.length > 0) {
  console.error("Многоточие в UI-строках пишется одним символом «…», а не тремя точками:");
  for (const row of ellipsis) console.error(`  ${row.file}:${row.line}  ${row.value}`);
  process.exit(1);
}

console.log("UI text hardcode check passed.");
