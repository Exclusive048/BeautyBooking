import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import KNOWN from "@/lib/rate-limit/sensitive-fail-open-known.json";
import FAIL_OPEN from "@/lib/rate-limit/fail-open-mutating-routes.json";

/**
 * FIX-B7 — третья половина сторожа инв. #6.
 *
 * `sensitive-routes.test.ts` проверяет ЧЛЕНСТВО, `…-completeness.test.ts` —
 * что не появилось НОВЫХ мутирующих роутов вне fail-closed. Оба зелены и при
 * этом ничего не говорят о том, ПРАВИЛЬНО ли классифицированы 108 уже
 * существующих. Здесь закрывается это: класс роута **выводится из его свойств**
 * — какие Prisma-модели он пишет по своему графу импортов, — а не берётся из
 * списка, поддерживаемого руками.
 *
 * 🔴 Наивное выведение НЕ работает, и это стоит знать до попытки его повторить:
 * при обходе графа без изъятий чувствительными оказываются **102 роута из 108**,
 * потому что ротация сессии пишет `RefreshSession`, а нотифаер —
 * `PushSubscription`, и оба достижимы из ЛЮБОГО аутентифицированного роута.
 * Присутствие такой записи означает «роут требует входа», а не «роут трогает
 * деньги». Поэтому `lib/{auth,notifications,queue,observability,logging}`
 * из обхода исключены, а сами две модели — из набора признаков.
 *
 * ⚠️ `sensitive-fail-open-known.json` — это **список НАХОДОК, а не одобренных**.
 * Сторож держит его замороженным в ОБЕ стороны: список не может молча вырасти
 * и не может молча сжаться.
 *
 * FIX-B12 — триаж завершён, и список сжался с 25 находок до одной: владелец
 * решил четыре класса (booking-write вне `/api/bookings`, ПДн, создание
 * аккаунта/подписки, админские деньги) как **fail-closed**, они переведены
 * префиксами в `SENSITIVE_ROUTE_PREFIXES`. Остался `/api/telegram/webhook` —
 * запись в графе есть, достижимости в проде нет (разбор — в самом JSON).
 *
 * @probe   что сломать: добавить в любой роут из снимка запись `prisma.billingPayment.create(`
 *          (или завести новый мутирующий роут, пишущий чувствительную модель).
 *          наблюдалось: «Появились НОВЫЕ чувствительные fail-open роуты: …» с именем сайта;
 *          после отката — зелёный.
 *
 * @probe   FIX-B12, проба переписанной не-вакуумности: сломать `MUTATION` на
 *          заведомо несовпадающий (`zzzNeverMatches`) → 2 failed, из них
 *          «обход графа перестал видеть запись `booking.*` из /api/bookings —
 *          детектор ослеп»; после отката — зелёный.
 *          ⚠️ Первая попытка пробы была НЕ блокирующей и дала честный зелёный:
 *          из `SENSITIVE_MODELS` убиралась одна строка `"booking"`, а
 *          `/api/bookings` пишет ещё и `bookingServiceItem`, который остался в
 *          списке. Мутация применилась (файл стал короче), сторож был прав —
 *          проба была плохой. Отсюда правило: прежде чем объявить сторож
 *          вакуумным, проверить, что мутация действительно снимает признак, а
 *          не соседний его источник.
 */

const APP = path.resolve(process.cwd(), "src", "app");
const MUTATION = "(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\\(";

/** Модели, запись в которые делает роут чувствительным. Инфраструктурные — исключены (см. шапку). */
const SENSITIVE_MODELS = [
  "billingPayment", "userSubscription", "billingPlan", "billingAuditLog", "mrrSnapshot",
  "userProfile", "otpCode", "userConsent", "telegramLinkToken", "vkLink", "yandexLink",
  "booking", "bookingPackage", "bookingServiceItem", "hotSlot",
  "clientCard", "clientNote", "chatMessage",
];

const INFRA = /src[\\/]lib[\\/](auth|notifications|queue|observability|logging)[\\/]/;

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.resolve(process.cwd(), "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function graphOf(entry: string, maxDepth = 3): string[] {
  const seen = new Set([entry]);
  const stack: Array<[string, number]> = [[entry, 0]];
  while (stack.length) {
    const [file, depth] = stack.pop()!;
    if (depth >= maxDepth) continue;
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/from\s+"([^"]+)"/g)) {
      const target = resolveImport(m[1]!, file);
      if (!target || INFRA.test(target) || seen.has(target)) continue;
      seen.add(target);
      stack.push([target, depth + 1]);
    }
  }
  return [...seen];
}

function writesSensitiveModel(entry: string): boolean {
  return graphOf(entry).some((file) => {
    const source = readFileSync(file, "utf8");
    return SENSITIVE_MODELS.some((model) =>
      new RegExp(`\\b(?:prisma|tx|db)\\.${model}\\.${MUTATION}`).test(source),
    );
  });
}

function routeEntry(route: string): string | null {
  const direct = path.join(APP, route.replace(/^\//, ""), "route.ts");
  return existsSync(direct) ? direct : null;
}

/**
 * FIX-B11 — детектор знал ОДИН механизм fail-closed из трёх.
 *
 * Снимок `fail-open-mutating-routes.json` строился по ПУТИ: роут считался
 * fail-open, если не попадает под `SENSITIVE_ROUTE_PREFIXES`. Но рантайм решает
 * по КЛЮЧУ (`isSensitiveRouteKey`), а ключей три семейства:
 *
 *  1. префикс пути          — тир прокси (`rl:<tier>:<ip>:<method>:<template>`);
 *  2. **префикс ключа**      — `SENSITIVE_KEY_PREFIXES`: роут со своим ключом
 *     (`rate:publicBooking:`, `rate:packageBook:`, `rate:studioPackageBook:`)
 *     fail-closed, хотя его путь ни под один префикс не подходит. Так три
 *     гостевых booking-роута — самые тревожные строки списка — оказались
 *     ложными срабатываниями: они давно fail-closed (SECURITY-EXPOSURE-AUDIT-01 · Y6);
 *  3. **fail-closed внутри модуля** — `lib/auth/otp-rate-limit.ts` не спрашивает
 *     `isSensitiveRouteKey` вовсе: любой отказ Redis он сам превращает в
 *     503 `RATE_LIMIT_UNAVAILABLE` / 429 (RES-11). Оба кабинетных email-роута
 *     ходят через него.
 *
 * Первые две проверки ВЫВОДЯТСЯ из исходника роута, а не перечисляются.
 */
const SENSITIVE_KEY_PREFIXES = [
  "rate:createBooking:", "rate:publicBooking:", "rate:packageBook:", "rate:studioPackageBook:",
  "rl:categories:propose:", "rl:/api/me/delete", "rl:/api/cabinet/master/delete",
  "rl:/api/cabinet/studio/delete", "rl:/api/bookings", "rl:/api/master/portfolio",
  "rl:/api/studio", "rl:/api/studios", "rl:/api/reviews",
];

function isFailClosedByOwnMechanism(entry: string): boolean {
  const source = readFileSync(entry, "utf8");
  const usesSensitiveKey = [...source.matchAll(/`(rate:[^`$]*|rl:[^`$]*)/g)].some(([, key]) =>
    SENSITIVE_KEY_PREFIXES.some((prefix) => key!.startsWith(prefix)),
  );
  const usesOtpLimiter = /otp-rate-limit/.test(source);
  return usesSensitiveKey || usesOtpLimiter;
}

/**
 * Посайтовые изъятия — каждое с причиной, проверенной руками (FIX-B11).
 * Оба класса детектор вывести НЕ может, и это его задокументированный предел:
 * обход графа импортов работает с гранулярностью МОДУЛЯ, поэтому роут,
 * импортирующий одну advisory-функцию из модуля, где рядом лежит запись,
 * наследует её признак.
 */
const NOT_FAIL_OPEN_FINDINGS: Record<string, string> = {
  "/api/public/packages/[id]/propose":
    "advisory: ноль `prisma.` в роуте; `proposeSoloPackageSelections` только читает — " +
    "признак унаследован от соседей по модулю `package-booking.ts` (брони материализует только /book)",
  "/api/public/packages/[id]/studio/propose":
    "advisory, то же самое для студийного близнеца",
  "/api/billing/renew/run":
    "задокументированное изъятие `SENSITIVE_ROUTE_EXCEPTIONS` (LOGIC-07): лок прогона " +
    "продлений намеренно fail-OPEN — от двойного списания защищает инв. #4, а не Redis",
};

const known = KNOWN as { routes: Record<string, { class: string; models: string }> };

/**
 * 🔴 Область обхода — ВЕСЬ fail-open-снимок, а не список находок.
 *
 * Первая версия перебирала `Object.keys(known.routes)`, то есть искала новое
 * среди уже известного: `appeared` не мог стать непустым ни при каком входе.
 * Поймано пробой (добавил запись `billingPayment.create` в `/api/favorites/toggle`
 * — сторож остался зелёным), а не ревью. Ровно тот класс, ради которого
 * заведён инв. #43.
 */
describe("инв. #6 · классификация выводится из свойств роута, а не из списка", () => {
  const detected = (FAIL_OPEN as string[])
    .map((route) => [route, routeEntry(route)] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== null)
    .filter(([route]) => !(route in NOT_FAIL_OPEN_FINDINGS))
    .filter(([, entry]) => !isFailClosedByOwnMechanism(entry))
    .filter(([, entry]) => writesSensitiveModel(entry))
    .map(([route]) => route);

  /**
   * 🔴 Не-вакуумность больше НЕ выводится из размера списка находок.
   *
   * Пока их было 25, `detected.length > 10` работал как проба: детектор заведомо
   * что-то находил. FIX-B12 закрыл 24 из 25 — и та же проверка стала бы ложным
   * красным, то есть ремедиация ломала бы сторож, который её и нашёл. Размер
   * списка находок вообще не свойство детектора: он стремится к нулю по мере
   * починки, а машинерия при этом обязана оставаться живой.
   *
   * Поэтому проверяются КОНТРОЛИ на самой машинерии, независимые от снимка:
   * положительный — роут, который заведомо пишет чувствительную модель (сломайся
   * обход графа или набор моделей, он покраснеет при любом размере списка),
   * отрицательный — роут, который заведомо не пишет (иначе «находкой» станет
   * всё, и детектор снова ничего не различает).
   */
  it("детектор не вакуумен: контроли машинерии, а не размер списка", () => {
    const positive = routeEntry("/api/bookings");
    const negative = routeEntry("/api/log-error");
    expect(positive, "контрольный роут /api/bookings исчез — обновите контроль").not.toBeNull();
    expect(negative, "контрольный роут /api/log-error исчез — обновите контроль").not.toBeNull();

    expect(
      writesSensitiveModel(positive!),
      "обход графа перестал видеть запись `booking.*` из /api/bookings — детектор ослеп",
    ).toBe(true);
    expect(
      writesSensitiveModel(negative!),
      "детектор считает чувствительным роут, который не пишет чувствительных моделей",
    ).toBe(false);
  });

  it("НОВЫХ чувствительных fail-open роутов не появилось", () => {
    const appeared = detected.filter((route) => !(route in known.routes)).sort();
    expect(
      appeared,
      "Появились НОВЫЕ чувствительные fail-open роуты (пишут деньги / auth / брони / ПДн, " +
        "но не попадают под SENSITIVE_ROUTE_PREFIXES). Либо добавьте префикс, либо внесите " +
        "их в sensitive-fail-open-known.json ОСОЗНАННО, понимая, что при обрыве Redis они " +
        "деградируют до memory-fallback: " + appeared.join(", "),
    ).toEqual([]);
  });

  it("список находок не протух: снятые с учёта роуты убираются", () => {
    const live = new Set(detected);
    const stale = Object.keys(known.routes).filter((route) => routeEntry(route) && !live.has(route));
    expect(
      stale,
      "Роуты больше не пишут чувствительные модели (или стали fail-closed) — уберите их " +
        "из списка находок: " + stale.join(", "),
    ).toEqual([]);
  });

  it("список помечен как НАХОДКИ, а не как одобренное", () => {
    // Защита от превращения списка в «ок напротив каждой строки»: пометка —
    // единственное, что отличает реестр находок от индульгенции.
    expect((KNOWN as { _: string })._).toMatch(/находки/i);
  });
});
