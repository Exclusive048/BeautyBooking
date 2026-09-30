#!/usr/bin/env node
/**
 * 29.09 доработки · 18 (PERF-02) — поведенческий сторож по СОБРАННЫМ чанкам:
 * публичные маршруты не везут тексты кабинетов, а их first-load JS не растёт
 * незаметно.
 *
 * Исходниковый сторож (`src/lib/ui/text-client-graph.test.ts`) судит о форме
 * доступа к `UI_TEXT` и о доменах шелла; этот — о том, что на самом деле
 * получилось после webpack. Разбиение держится на отслеживании доступа к
 * пространству имён и на `sideEffects: false` (`next.config.ts`), и любое из
 * них может отказать молча: сборка зелёная, текст просто снова едет целиком.
 *
 * Запуск — после `next build`: `node scripts/check-client-text-bundle.mjs [папка .next]`
 * (CI — шаг `build-images.yml` по `.next`, вынутой из собранного образа).
 *
 * Набор чанков маршрута. `page_client-reference-manifest.js` перечисляет
 * клиентские модули ВСЕХ сегментов (включая чужие группы маршрутов), а браузер
 * грузит только отрендеренные. Поэтому берутся модули, у которых среди чанков
 * есть чанк сегмента из цепочки маршрута (`static/chunks/app/<сегмент>/layout-*.js`
 * и т.п.; цепочка — layout/template/error/not-found/loading/global-error по
 * папкам `src/app` + page), плюс `rootMainFiles`.
 *
 * Маркеры домена — его строковые константы длиной от 16 символов с кириллицей,
 * которых нет ни в одном другом домене; выводятся из `src/lib/ui/text/*.ts`,
 * руками не пишутся. Ищутся ЦЕЛЫМ литералом (в кавычках): подстрокой
 * «Загружаем студию» (кабинет студии) находилась внутри «Загружаем студию…»
 * (публичная студия) — ложная утечка на первом же прогоне. Любой найденный
 * маркер = домен (хотя бы частично) приехал на маршрут: минификатор может
 * выбросить неиспользуемые ключи объекта, поэтому «первая строка домена» как
 * маркер была бы слепой к частичной утечке.
 *
 * Бюджет — gzip суммы чанков маршрута: замер 2026-09-30 на сборке с заглушками
 * `NEXT_PUBLIC_*` из `build-images.yml`, допуск +5 %. Выросло законно (новая
 * фича на главной) — поднимите бюджет ЗДЕСЬ, приложив замер к изменению.
 *
 * @probe 2026-09-30, сборка с CI-заглушками:
 *   1. `aria-label={UI_TEXT.adminPanel.aria.sidebar}` в
 *      `components/layout/auth-user-menu.tsx` → красный на всех трёх маршрутах:
 *      «/: домен admin-panel — «Финансы и тарифы» в static/chunks/93226-….js»
 *      (домен приезжает ЦЕЛИКОМ: обращение из модуля шелла).
 *   2. Машинерия: маркеры с заменой кириллицы на `\uXXXX` (как экранировал бы
 *      минификатор с ascii_only) → красный «маркеры домена admin-panel не
 *      найдены ни в одном чанке сборки — машинерия сломана» (и два других).
 *   3. Первый прогон дал ложную утечку подстрокой (см. «Маркеры домена» выше) —
 *      поиск целым литералом её убрал.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const NEXT_DIR = resolve(ROOT, process.argv[2] ?? ".next");
const TEXT_DIR = join(ROOT, "src", "lib", "ui", "text");

/**
 * Бюджеты first-load JS, gzip, kB (сборка с CI-заглушками). 29.09 доработки ·
 * 18 — 265 / 269 / 299; · 19 (framer-motion на LazyMotion) — 255 / 258 / 288.
 */
const ROUTES = [
  { route: "/", pageDir: "src/app", budgetKb: 255 },
  { route: "/catalog", pageDir: "src/app/catalog", budgetKb: 258 },
  { route: "/u/[username]", pageDir: "src/app/(public)/u/[username]", budgetKb: 288 },
];
const TOLERANCE = 1.05;
/** Домены кабинетов — на публичных маршрутах их быть не должно ни строчкой. */
const FORBIDDEN_DOMAINS = ["admin-panel", "studio-cabinet", "cabinet-master"];
const SEGMENT_FILES = ["layout", "template", "error", "not-found", "loading", "global-error"];
const MIN_MARKER_LENGTH = 16;
const MIN_MARKERS = 30;

const failures = [];
const fail = (message) => failures.push(message);

// --- маркеры доменов ---------------------------------------------------------
const STRING_RE = /"((?:[^"\\\n]|\\.)*)"/g;
const stringsByDomain = new Map();
for (const name of readdirSync(TEXT_DIR)) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
  const source = readFileSync(join(TEXT_DIR, name), "utf8");
  const strings = new Set();
  for (const match of source.matchAll(STRING_RE)) {
    const value = match[1];
    if (value.includes("\\")) continue;
    if (value.length >= MIN_MARKER_LENGTH && /[А-Яа-яЁё]/.test(value)) strings.add(value);
  }
  stringsByDomain.set(name.replace(/\.ts$/, ""), strings);
}
const occurrences = new Map();
for (const strings of stringsByDomain.values()) {
  for (const value of strings) occurrences.set(value, (occurrences.get(value) ?? 0) + 1);
}
/** Литерал в минифицированном коде: кавычки любого вида вокруг значения. */
const containsLiteral = (text, value) =>
  text.includes(`"${value}"`) || text.includes(`'${value}'`) || text.includes(`\`${value}\``);
const markers = new Map();
for (const domain of FORBIDDEN_DOMAINS) {
  const own = stringsByDomain.get(domain);
  if (!own) {
    fail(`нет файла домена src/lib/ui/text/${domain}.ts — обновите FORBIDDEN_DOMAINS`);
    continue;
  }
  const unique = [...own].filter((value) => occurrences.get(value) === 1);
  if (unique.length < MIN_MARKERS) fail(`у домена ${domain} всего ${unique.length} маркеров (нужно ≥ ${MIN_MARKERS})`);
  markers.set(domain, unique);
}

// --- чанки ---------------------------------------------------------------------
if (!existsSync(join(NEXT_DIR, "build-manifest.json"))) {
  console.error(`check-client-text-bundle: нет сборки в ${NEXT_DIR} — сначала next build`);
  process.exit(1);
}
const buildManifest = JSON.parse(readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8"));
const chunkText = new Map();
const readChunk = (chunk) => {
  if (!chunkText.has(chunk)) chunkText.set(chunk, readFileSync(join(NEXT_DIR, decodeURIComponent(chunk))));
  return chunkText.get(chunk);
};

// Машинерия: маркеры обязаны находиться в сборке вообще (кабинеты их везут).
// Иначе «не найдено на маршруте» ничего не значит — например, минификатор
// начал экранировать кириллицу.
const allChunks = [];
const walkChunks = (dir, prefix) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walkChunks(join(dir, entry.name), rel);
    else if (entry.name.endsWith(".js")) allChunks.push(rel);
  }
};
walkChunks(join(NEXT_DIR, "static", "chunks"), "static/chunks");
for (const [domain, list] of markers) {
  const seen = allChunks.some((chunk) => {
    const text = readChunk(chunk).toString("utf8");
    return list.some((marker) => containsLiteral(text, marker));
  });
  if (!seen) fail(`маркеры домена ${domain} не найдены ни в одном чанке сборки — машинерия сломана`);
}

function chainSegments(pageDir) {
  const out = [];
  const parts = pageDir.split("/");
  for (let i = 2; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const segment = dir.replace(/^src\//, "");
    for (const name of SEGMENT_FILES) {
      if (existsSync(join(ROOT, dir, `${name}.tsx`))) out.push(`${segment}/${name}`);
    }
  }
  out.push(`${pageDir.replace(/^src\//, "")}/page`);
  return out;
}

function routeChunks(pageDir) {
  const manifestFile = join(NEXT_DIR, "server", pageDir.replace(/^src\//, ""), "page_client-reference-manifest.js");
  if (!existsSync(manifestFile)) return null;
  const holder = { __RSC_MANIFEST: {} };
  new Function("globalThis", "self", readFileSync(manifestFile, "utf8"))(holder, holder);
  const entry = Object.values(holder.__RSC_MANIFEST)[0];
  const segments = chainSegments(pageDir);
  const isChainChunk = (chunk) => {
    const match = decodeURIComponent(chunk).match(/^static\/chunks\/(app\/.*)-[0-9a-f]+\.js$/);
    return match ? segments.includes(match[1]) : false;
  };
  const chunks = new Set(buildManifest.rootMainFiles);
  let hasSegmentChunk = false;
  for (const mod of Object.values(entry.clientModules)) {
    const list = mod.chunks.filter((chunk) => typeof chunk === "string" && chunk.endsWith(".js"));
    if (list.some(isChainChunk)) {
      hasSegmentChunk = true;
      for (const chunk of list) chunks.add(chunk);
    }
  }
  return hasSegmentChunk ? [...chunks] : [];
}

// --- маршруты ------------------------------------------------------------------
const rows = [];
for (const { route, pageDir, budgetKb } of ROUTES) {
  const chunks = routeChunks(pageDir);
  if (chunks === null) {
    fail(`${route}: нет манифеста ${pageDir} — маршрут переехал? обновите ROUTES`);
    continue;
  }
  if (chunks.length === 0) {
    fail(`${route}: не найдено ни одного чанка сегментов цепочки — формат манифеста изменился`);
    continue;
  }
  let gzip = 0;
  for (const chunk of chunks) {
    const buffer = readChunk(chunk);
    gzip += gzipSync(buffer).length;
    const text = buffer.toString("utf8");
    for (const [domain, list] of markers) {
      const hit = list.find((marker) => containsLiteral(text, marker));
      if (hit) fail(`${route}: домен ${domain} — «${hit.slice(0, 60)}» в ${chunk}`);
    }
  }
  const kb = gzip / 1024;
  rows.push(`${route}: чанков ${chunks.length}, first-load JS ${kb.toFixed(1)} kB gzip (бюджет ${budgetKb} × ${TOLERANCE})`);
  if (kb > budgetKb * TOLERANCE) {
    fail(`${route}: first-load JS ${kb.toFixed(1)} kB gzip > бюджета ${(budgetKb * TOLERANCE).toFixed(1)} kB`);
  }
}

console.log(rows.join("\n"));
if (failures.length > 0) {
  console.error("\ncheck-client-text-bundle: публичные маршруты везут лишнее —");
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}
console.log("check-client-text-bundle: ок — тексты кабинетов не едут на публичные маршруты, бюджеты соблюдены.");
