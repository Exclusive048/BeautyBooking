/**
 * check:dead-classes (UI-16) — гейт против класса, который компилируется В НИЧТО.
 *
 * Класс дефекта известен проекту и рецидивировал четыре раза (`shadow-brand` —
 * 7 сайтов, `bg/text-destructive` — 3, точка статуса на `/login`, и наконец
 * 192 сайта, найденные аудитом AUDIT-FRESH-05 как UI-01…UI-08). Каждый раз его
 * находили ГЛАЗАМИ: разметка выглядит правильной, стиля нет, ошибки нет.
 *
 * Ни один из существующих гейтов его по своей природе не видит: `lint` смотрит
 * AST, `typecheck` — типы, `check:ui-text` — русские строки, `check:encoding` и
 * `check:mojibake` — байты. Класс-строка для всех них — просто строка.
 *
 * Метод (тот же, которым аудит и нашёл 192 сайта):
 *
 *  1. собрать боевой CSS-бандл настоящим Tailwind с настоящим конфигом и
 *     настоящим `globals.css` — в нём и сгенерированные утилиты, и авторские
 *     правила `@layer components`;
 *  2. вытащить кандидатов из СТРОКОВЫХ ЛИТЕРАЛОВ исходников (классы в этом
 *     проекте живут в отдельных константах — `variants`, `sizes`, `cn(...)`, —
 *     а не только в `className=`, поэтому сузить до атрибута нельзя);
 *  3. отбросить всё, что бандл сгенерировал;
 *  4. из остатка оставить только то, что ЕСТЬ класс: первый сегмент токена
 *     совпадает с пространством имён, которое бандл реально использует
 *     (`bg`, `text`, `shadow`, `pb`, …) либо перечислено в `CUSTOM_NAMESPACES`;
 *  5. упасть на остатке.
 *
 * Почему бандл, а не «зонд из утилит + реестр кастомных классов»: реестр
 * пришлось бы вычитать, и тогда УДАЛЕНИЕ правила `.lux-card` из `globals.css`
 * (ровно то, что произошло в `68c17f9` и стало UI-01) гейт бы не заметил —
 * класс числился бы «кастомным, значит легальным». Здесь наоборот: кастомное
 * правило обязано физически присутствовать в собранном CSS.
 *
 * `CUSTOM_NAMESPACES` нужен для второй половины того же сценария: если удалить
 * ВСЕ правила семейства (`.login-*` целиком), пространство имён исчезнет из
 * бандла вместе с ними, и токены из разметки перестанут быть кандидатами.
 * Реестр держит пространство имён живым независимо от бандла — по образцу
 * `scripts/raw-sql-objects.mjs`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

/** Каталоги, которые сканирует сам Tailwind (`content` в `tailwind.config.js`). */
const CONTENT_DIRS = ["src/app", "src/components", "src/features"];
const SOURCE_EXT = /\.(js|jsx|ts|tsx|mdx)$/;
/**
 * Тесты исключены намеренно: гварды этого проекта ПЕРЕЧИСЛЯЮТ мёртвые классы
 * как отрицательные примеры (`tailwind-bridge.test.ts` держит `bg-bg-elevated`
 * и `border-bg-main`, `globals-contrast.test.ts` — имена токенов). Считать их
 * нарушением значило бы наказывать за сторожа.
 */
const TEST_FILE = /\.test\.(ts|tsx)$/;

/**
 * Пространства имён авторских классов из `src/app/globals.css` и сторонних
 * стилей. Смысл — не «разрешить», а «продолжать проверять, даже если из бандла
 * пропало последнее правило семейства».
 */
export const CUSTOM_NAMESPACES = [
  "lux", // .lux-card / .lux-input — база карточек и полей (UI-01)
  "login", // .login-* — оформление брендовой панели /login
  "map", // .map-marker / .map-cluster / .map-hint — слой Яндекс.Карт
  "glass", // .glass-panel (UI-07)
  "aurora", // .aurora-bg
  "legal", // .legal-prose — типографика правовых страниц
  "histogram", // .histogram-slider-thumb (UI-07)
  "scrollbar", // .scrollbar-hide
  "rdp", // react-day-picker: .rdp-theme наша, остальные .rdp-* — библиотечные
];

/**
 * Строки, которые ВЫГЛЯДЯТ классом, но им не являются. Реестр по образцу
 * `scripts/raw-sql-objects.mjs`: точными значениями и с обоснованием на каждое.
 */
export const NOT_A_CLASS = new Set([
  // CSS-значения в инлайновых стилях. `global-error.tsx` рендерится при
  // упавшем root-layout и потому несёт собственный `<style>`; OG-превью
  // (`next/og`, satori) принимает стили объектом, а не классами.
  "flex-end",
  "flex-start",
  "space-between",
  // Директивы заголовка `Cache-Control`.
  "max-age",
  // Имена HTTP-заголовков в fetch/route-коде. Стали кандидатами после UI-29:
  // `after:content-['']` в Button оживил пространство `content-*` в бандле
  // (утилита content). Сами строки — заголовки, не классы.
  "content-type",
  "content-length",
  // Ключи localStorage — совпали с пространством `mr-*` (margin-right).
  "mr-stories-viewed",
  "mr-stories-viewed-items",
  // Плашка «Разрешите акции мастеров» (29.09 доработки · 16) — «скрыть» на устройстве.
  "mr-marketing-banner-dismissed",
  // Якорь раздела справки (`href="#fixed-vs-flexible"`), совпал с `fixed`.
  "fixed-vs-flexible",
]);

/**
 * Значения этих атрибутов — идентификаторы, а не классы: QA-харнесс ищет по
 * `data-testid`, framer-motion связывает элементы по `layoutId`. Часть из них
 * начинается с `login-`, то есть попадает в живое пространство имён авторских
 * классов, и без вычёркивания гейт краснел бы на каждом новом testid.
 */
export const IDENTIFIER_ATTRIBUTES = /\b(data-testid|testId|layoutId)\s*[=:]\s*\{?\s*(["'])(?:[^"'\\\n]|\\.)*\2/g;

export function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return SOURCE_EXT.test(full) && !TEST_FILE.test(full) ? [full] : [];
  });
}

/**
 * Селекторы правил; тела деклараций пропускаются целиком.
 *
 * Комментарии снимаются ДО разбора, и это не косметика: `/* — Marquee — *␘/`
 * перед `@media` прилипал к заголовку правила, тот переставал начинаться с `@`,
 * и весь блок пропускался как обычное тело — вместе с ним из результата
 * исчезали `.login-otp-pop`, `.login-mq-zone` и всё, что живёт под
 * `prefers-reduced-motion`.
 */
export function selectorTexts(rawCss) {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let buf = "";
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      if (head.startsWith("@")) continue; // @media / @supports — идём внутрь
      out.push(head);
      let depth = 1;
      i += 1;
      for (; i < css.length && depth > 0; i += 1) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") depth -= 1;
      }
      i -= 1;
      continue;
    }
    if (ch === "}") {
      buf = "";
      continue;
    }
    buf += ch;
  }
  return out;
}

/** CSS-экранирование: `\2c ` → `,`, `\/` → `/`, `\[` → `[`. */
export function unescapeCss(value) {
  return value
    .replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\(.)/g, "$1");
}

export function generatedClasses(css) {
  const out = new Set();
  const re = /\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[A-Za-z0-9_-])+)/g;
  for (const selector of selectorTexts(css)) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(selector)) !== null) out.add(unescapeCss(m[1]));
  }
  return out;
}

/**
 * Содержимое строковых литералов. Комментарии выброшены (в них полно
 * CSS-свойств из объяснений), интерполяция шаблонной строки изымается из
 * текста (иначе из `` `gap-${n}` `` соберётся мёртвый на вид `gap-`) и
 * разбирается рекурсивно — строки внутри неё такие же кандидаты.
 *
 * Тип возврата объявлен явно: функция рекурсивная, и без аннотации TypeScript
 * выводит `any` (`allowJs`), а вместе с ним теряет типы у всех потребителей.
 *
 * @param {string} src
 * @returns {string[]}
 */
export function stringLiterals(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      let buf = "";
      while (i < n) {
        if (src[i] === "\\") {
          buf += " ";
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          break;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          const exprStart = i + 2;
          let depth = 0;
          while (i < n) {
            if (src[i] === "{") depth += 1;
            else if (src[i] === "}") {
              depth -= 1;
              if (depth === 0) {
                i += 1;
                break;
              }
            }
            i += 1;
          }
          // Выражение разбирается ОТДЕЛЬНО и рекурсивно, а не склеивается с
          // соседним текстом. Две причины. Первая: `cn(cond ? "bg-red-500" :
          // "")` внутри шаблона — обычный строковый литерал с классами, и
          // терять его нельзя. Вторая: без изъятия выражения ВЛОЖЕННЫЙ backtick
          // сканер примет за закрывающий и с этого места разъедется — всё, что
          // стоит дальше, перестанет читаться как строка, и гейт молча
          // перестанет проверять хвост файла, напечатав то же самое «ок».
          out.push(...stringLiterals(src.slice(exprStart, Math.max(exprStart, i - 1))));
          buf += "   ";
          continue;
        }
        buf += src[i];
        i += 1;
      }
      out.push(buf);
      continue;
    }
    i += 1;
  }
  return out;
}

const TOKEN_CHAR = /[A-Za-z0-9_\-/.:!%#&@]/;

/** Токены строки; `[…]` — атомарный кусок (произвольное значение Tailwind). */
export function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (!TOKEN_CHAR.test(text[i]) && text[i] !== "[") {
      i += 1;
      continue;
    }
    let token = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === "[") {
        const start = i;
        let depth = 0;
        while (i < text.length) {
          if (text[i] === "[") depth += 1;
          else if (text[i] === "]") {
            depth -= 1;
            if (depth === 0) {
              i += 1;
              break;
            }
          }
          i += 1;
        }
        token += text.slice(start, i);
        continue;
      }
      if (!TOKEN_CHAR.test(ch)) break;
      token += ch;
      i += 1;
    }
    if (token) out.push(token);
  }
  return out;
}

/** Разбор `hover:md:bg-x/50` на варианты и утилиту; `[…]` — атомарно. */
export function splitVariants(token) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    else if (ch === ":" && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  return { variants: parts, utility: token.slice(start) };
}

export function utilityPart(token) {
  return splitVariants(token).utility;
}

/** Модификатор непрозрачности/дроби: часть после `/` вне скобок. */
export function modifierOf(utility) {
  let depth = 0;
  for (let i = 0; i < utility.length; i += 1) {
    const ch = utility[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    else if (ch === "/" && depth === 0) return utility.slice(i + 1);
  }
  return null;
}

/** Пространство имён: первый сегмент утилиты (`bg-primary/10` → `bg`). */
export function namespaceOf(token) {
  const utility = utilityPart(token).replace(/^!/, "").replace(/^-/, "");
  const cut = utility.search(/[-/[]/);
  return cut === -1 ? utility : utility.slice(0, cut);
}

function buildBundle() {
  const dir = mkdtempSync(join(tmpdir(), "dead-classes-"));
  const out = join(dir, "bundle.css");
  try {
    // Через `node <cli.js>`, а не через `npx`: на Windows `npx.cmd` требует
    // shell и молча отваливается из `execFileSync`.
    execFileSync(
      process.execPath,
      [
        resolve(ROOT, "node_modules/tailwindcss/lib/cli.js"),
        "-c",
        "tailwind.config.js",
        "-i",
        "src/app/globals.css",
        "-o",
        out,
      ],
      { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] }
    );
    return { css: readFileSync(out, "utf8"), dir };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    const stderr = error?.stderr?.toString?.() ?? "";
    console.error("check:dead-classes — не удалось собрать CSS-бандл Tailwind.");
    if (stderr) console.error(stderr.trim());
    process.exit(1);
  }
}

/**
 * Прогон гейта: сборка бандла + сверка. Вынесен в функцию, чтобы тест мог
 * импортировать чистые хелперы, не запуская сборку Tailwind.
 */
function main() {
  const { css, dir } = buildBundle();
  rmSync(dir, { recursive: true, force: true });

  const generated = generatedClasses(css);
  const namespaces = new Set([...generated].map((name) => namespaceOf(name)));
  for (const custom of CUSTOM_NAMESPACES) namespaces.add(custom);

  /**
   * Варианты, которые бандл реально использует (`hover`, `md`, `dark`,
   * `group-hover`, `data-[state=open]` …). Токен с неизвестным вариантом —
   * почти всегда не класс вовсе (`box-sizing:border-box` в инлайновом стиле,
   * `prefers-color-scheme:dark` в медиазапросе). Плата известна: ОПЕЧАТКА в
   * самом варианте (`hovr:bg-red-500`) гейтом не ловится. Она принята
   * сознательно — все четыре рецидива этого дефекта в проекте были в имени
   * УТИЛИТЫ, а не варианта, и ловить второе ценой ложного срабатывания на
   * каждом инлайновом стиле значило бы получить гейт, который отключат.
   */
  const knownVariants = new Set();
  for (const name of generated) {
    for (const variant of splitVariants(name).variants) knownVariants.add(variant);
  }

  const dead = new Map(); // token → Set<file>
  for (const contentDir of CONTENT_DIRS) {
    for (const file of walk(resolve(ROOT, contentDir))) {
      const relative = file.slice(ROOT.length + 1).split(sep).join("/");
      const source = readFileSync(file, "utf8").replace(IDENTIFIER_ATTRIBUTES, "");
      for (const literal of stringLiterals(source)) {
        for (const token of tokenize(literal)) {
          if (generated.has(token)) continue;
          if (NOT_A_CLASS.has(token)) continue;
          if (/[ ${}`\\]/.test(token)) continue; // собрано интерполяцией
          if (!/^-?!?[a-z]/.test(token)) continue;
          if (!/[-/[]/.test(token)) continue; // одно слово — не кандидат
          if (/[-/.:]$/.test(token)) continue; // огрызок динамического имени
          const { variants, utility } = splitVariants(token);
          if (variants.some((variant) => !knownVariants.has(variant))) continue;
          // Модификатор Tailwind — всегда число или `[…]` (`bg-x/50`, `w-1/2`).
          // Буква после `/` означает MIME-тип или путь, а не утилиту.
          const modifier = modifierOf(utility);
          if (modifier !== null && !/^(\d|\[)/.test(modifier)) continue;
          const space = namespaceOf(token);
          if (!space || !namespaces.has(space)) continue;
          if (!dead.has(token)) dead.set(token, new Set());
          dead.get(token).add(relative);
        }
      }
    }
  }

  if (dead.size === 0) {
    console.log(`check:dead-classes — ок (${generated.size} классов в бандле)`);
    process.exit(0);
  }

  console.error("check:dead-classes — классы, которые компилируются В НИЧТО:\n");
  for (const [token, files] of [...dead].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.error(`  ${token}`);
    for (const file of [...files].sort()) console.error(`      ${file}`);
  }
  console.error(
    "\nВ бандле для них нет ни одного правила: разметка выглядит правильной, стиля нет, ошибки нет." +
      "\nЛибо почините имя (опечатка / отсутствующий мост в tailwind.config.js / отсутствующее" +
      "\nправило в globals.css), либо — если это не класс — внесите строку в NOT_A_CLASS" +
      "\nв scripts/check-dead-classes.mjs с обоснованием."
  );
  process.exit(1);
}

// Запуск только при прямом вызове (не при импорте из теста).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
