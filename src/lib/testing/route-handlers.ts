/**
 * FIX-C7 · RETRO-PROBE — какие HTTP-методы экспортирует файл роута.
 *
 * ## Зачем отдельный модуль
 *
 * Два сторожа классификации безопасности выводили набор роутов из дерева
 * СОБСТВЕННОЙ копией одного и того же шаблона:
 *
 *     /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/
 *
 * — `rate-limit/sensitive-routes-completeness.test.ts` (инв. #6, «новый
 * мутирующий роут не проваливается в fail-open молча») и
 * `rate-limit/fail-closed-classes.test.ts` (четыре класса fail-closed).
 *
 * 🔴 **Оба были WEAKER-THAN-CLAIMED, и это доказано A/B на одном и том же
 * роуте.** Проба в шапке первого гласила «завести
 * `src/app/api/refunds/request/route.ts` с `export async function POST`» —
 * сторож краснел. Тот же роут, по тому же пути, объявленный
 *
 *     export const POST = async (req: Request) => …
 *
 * сторож НЕ видел: 4 passed, зелено. То есть вердикт держался на том, какую
 * форму объявления автор пробы случайно выбрал, а не на правиле.
 *
 * Форма не экзотическая — это идиома, к которой приходят в тот момент, когда
 * обработчик заворачивают (`export const POST = withRateLimit(handler)`).
 * Сегодня в дереве таких ноль (проверено), поэтому живой дыры не было; дыра
 * была в утверждении сторожа о себе.
 *
 * ## Что распознаётся
 *
 * Три формы объявления, все валидные для Next-роутов:
 *   1. `export async function POST(…)` / `export function POST(…)`;
 *   2. `export const POST = …` (и `let`/`var` — редко, но синтаксически те же);
 *   3. `export { handler as POST }` — переэкспорт под именем метода.
 *
 * Третья добавлена не для полноты: её прямо называет соседний сторож
 * `api/auth/telegram-link-post-removed.test.ts` — то есть в проекте уже знали,
 * что она достижима, но знание не доехало до сторожей классификации.
 *
 * ⚠️ Чего НЕ распознаётся и не должно: динамические формы
 * (`export const [GET, POST] = …`, присвоение через `Object.assign`). Они не
 * встречаются и их появление — само по себе повод для ревью. Граница названа,
 * чтобы «зелено» читалось как «известных форм нет».
 */

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof METHODS)[number];

const METHOD_ALTERNATION = METHODS.join("|");

const DECLARATIONS = [
  // 1. export async function POST(…) / export function POST(…)
  new RegExp(String.raw`export\s+(?:async\s+)?function\s+(${METHOD_ALTERNATION})\b`, "g"),
  // 2. export const POST = … (тип-аннотация допускается: `export const POST: Handler = …`)
  new RegExp(String.raw`export\s+(?:const|let|var)\s+(${METHOD_ALTERNATION})\s*[:=]`, "g"),
  // 3. export { handler as POST }
  new RegExp(String.raw`export\s*\{[^}]*?\bas\s+(${METHOD_ALTERNATION})\b`, "g"),
];

/**
 * Методы, экспортированные файлом роута. Порядок — как у `METHODS`, дубликаты
 * схлопнуты; вызывающему важна принадлежность, а не порядок объявления.
 *
 * Комментарии вызывающий обязан вырезать сам (`lib/testing/source-scan.ts`),
 * если для его правила это существенно: закомментированный `export async
 * function POST` — это отсутствующий роут, а не присутствующий.
 */
export function exportedHandlerMethods(source: string): HttpMethod[] {
  const found = new Set<HttpMethod>();
  for (const pattern of DECLARATIONS) {
    for (const match of source.matchAll(pattern)) {
      found.add(match[1] as HttpMethod);
    }
  }
  return METHODS.filter((method) => found.has(method));
}

/** Есть ли у файла роута хотя бы один мутирующий обработчик. */
export function hasMutatingHandler(source: string): boolean {
  return exportedHandlerMethods(source).some(
    (method) => method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE",
  );
}
