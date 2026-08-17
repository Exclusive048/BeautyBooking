import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportedHandlerMethods } from "@/lib/testing/route-handlers";

/**
 * FIX-B12 — четыре класса роутов из триажа FIX-B11 стали fail-closed.
 *
 * Проверяется ПОВЕДЕНИЕ, а не форма кода: запрос к роуту класса при
 * недоступном Redis обязан получить отказ и НЕ дойти до обработчика. Поэтому
 * тест гоняет настоящий лимитер (`@/lib/rate-limit`) и настоящий прокси
 * (`@/proxy`), а Redis — единственное, что здесь подменено: переключатель
 * `redis.available` даёт обе половины (обрыв и норму) через один и тот же
 * реальный путь решения. Проверка вида «в списке префиксов есть строка
 * `/api/me`» была бы ровно тем вакуумным сторожем, против которого заведён
 * инв. #43: она зеленеет и при сломанном рендеринге отказа, и при отключённом
 * тире прокси.
 *
 * «Не дошёл до обработчика» проверяется отсутствием `x-middleware-next` —
 * заголовка, которым `NextResponse.next()` разрешает запросу идти дальше. Это и
 * есть «не записал»: обработчик не выполняется вовсе, поэтому ни одной
 * `prisma.*`-мутации произойти не может. Мокать Prisma и считать вызовы было бы
 * слабее — так проверялось бы, что мы не записали, а не что мы не начали.
 *
 * @probe   что сломать (прогонялось по одному, каждый раз с откатом и сверкой
 *          байт-в-байт; наблюдавшиеся падения — дословно):
 *   1. убрать `"/api/admin/billing"` из `SENSITIVE_ROUTE_PREFIXES` → 2 failed:
 *      представитель класса и пин «Роуты класса «(а) админские деньги» больше не
 *      fail-closed … GET /api/admin/billing, …, POST /api/admin/billing/refund» (9 имён);
 *   2. убрать `"/api/master/bookings"` → 2 failed, пин перечислил 5 имён,
 *      включая POST /api/master/bookings/seen — соседа, которого в тесте нет
 *      и который покрыт только потому, что список выводится из дерева;
 *   3. убрать `"/api/master/clients"` → 2 failed, пин перечислил 6 имён,
 *      включая DELETE …/card/photos/[photoId] и GET …/detail;
 *   4. убрать `"/api/profiles"` → 3 failed (представитель + проверка конверта,
 *      она идёт по тому же роуту, + пин с двумя именами);
 *   5. вернуть прокси статус 429 вместо 503 на ветке `unavailable` → 4 failed:
 *      все четыре представителя, «expected 429 to be 503».
 *
 * ⚠️ Ложный красный при постройке: первый прогон шёл с `--reporter=basic`
 * (в vitest 4 такого репортёра нет), и падение загрузчика читалось как
 * сработавший сторож. Проба обязана отличать «упал тест» от «упал раннер» —
 * verdict здесь берётся из текста ассерта, а не из кода возврата.
 */

const redis = vi.hoisted(() => ({
  available: true,
  counters: new Map<string, number>(),
}));

const getRedisConnection = vi.hoisted(() =>
  vi.fn(async () => {
    if (!redis.available) return null;
    return {
      async incr(key: string) {
        const next = (redis.counters.get(key) ?? 0) + 1;
        redis.counters.set(key, next);
        return next;
      },
      async expire() {
        return true;
      },
    };
  }),
);

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection,
  withRedisCommandTimeout: <T>(_operation: string, promise: Promise<T>) => promise,
}));
// Прокси не должен уходить в ротацию сессии: запросы здесь без кук, но модуль
// тянет Prisma на импорте.
vi.mock("@/lib/auth/session-refresh", () => ({
  rotateSessionWithTelemetry: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken: vi.fn(() => null) }));

import { isSensitiveRouteKey } from "@/lib/rate-limit";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";
import { proxy } from "@/proxy";

const APP = path.resolve(process.cwd(), "src", "app");

/**
 * Класс → поддеревья, объявленные решением владельца. Руками здесь ТОЛЬКО это:
 * членство в классе — продуктовое суждение, вывести его из кода нельзя (тот же
 * предел, что документирует `sensitive-routes-completeness.test.ts`).
 *
 * Сами роуты класса ВЫВОДЯТСЯ из дерева `src/app/api`, поэтому новый соседний
 * роут под тем же поддеревом наследует требование сам, без правки списка.
 */
const CLASS_SUBTREES: Array<{ label: string; subtrees: string[] }> = [
  {
    label: "(а) админские деньги",
    subtrees: ["/api/admin/billing", "/api/admin/users"],
  },
  {
    label: "(б) booking-write вне /api/bookings",
    subtrees: [
      "/api/master/bookings",
      "/api/model-applications",
      "/api/admin/hot-slots",
      "/api/cabinet/master/schedule",
    ],
  },
  {
    label: "(в) ПДн",
    subtrees: [
      "/api/me",
      "/api/cabinet/user/profile",
      "/api/master/clients",
      "/api/chat/threads",
      "/api/integrations/vk",
    ],
  },
  {
    label: "(г) создание аккаунта / подписки",
    subtrees: ["/api/onboarding", "/api/profiles", "/api/invites"],
  },
];

type ApiRoute = { route: string; methods: string[] };

function collectApiRoutes(dir: string, acc: ApiRoute[] = []): ApiRoute[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectApiRoutes(full, acc);
      continue;
    }
    if (entry !== "route.ts") continue;
    // FIX-C7: вторая копия того же шаблона, что оказалась WEAKER-THAN-CLAIMED в
    // соседнем `sensitive-routes-completeness.test.ts` — она не видела
    // `export const POST = …`. Распознавание форм — общее, в
    // `lib/testing/route-handlers.ts`.
    const methods = exportedHandlerMethods(readFileSync(full, "utf8"));
    const rel = path.relative(APP, dir).split(path.sep).join("/");
    acc.push({ route: "/" + rel.replace(/\/\([^)]*\)/g, ""), methods });
  }
  return acc;
}

const ALL_ROUTES = collectApiRoutes(path.join(APP, "api"));

const proxyKey = (method: string, pathname: string) =>
  `rl:publicApi:198.51.100.9:${method}:${toApiRouteTemplate(pathname)}`;

async function callProxy(method: string, pathname: string) {
  const response = await proxy(
    new NextRequest(`https://example.test${pathname}`, {
      method,
      // SEC-08: без этого заголовка мутация отклоняется как межсайтовая, и тест
      // измерял бы CSRF-слой вместо рейт-лимита.
      headers: { "sec-fetch-site": "same-origin" },
    }),
  );
  const passedThrough = response.headers.get("x-middleware-next") === "1";
  const body = passedThrough ? null : await response.json().catch(() => null);
  return { status: response.status, passedThrough, body, headers: response.headers };
}

/** Представитель класса — по одному, тяжёлая половина проверки идёт через прокси. */
const REPRESENTATIVES: Array<{ label: string; method: string; pathname: string }> = [
  { label: "(а) админские деньги", method: "POST", pathname: "/api/admin/billing/refund" },
  { label: "(б) booking-write вне /api/bookings", method: "POST", pathname: "/api/master/bookings" },
  { label: "(в) ПДн", method: "PATCH", pathname: "/api/master/clients/ck-client-1/card" },
  { label: "(г) создание аккаунта / подписки", method: "POST", pathname: "/api/profiles/master" },
];

beforeEach(() => {
  redis.available = true;
  redis.counters.clear();
  getRedisConnection.mockClear();
});

describe("FIX-B12 · при обрыве Redis роут класса отказывает и не доходит до обработчика", () => {
  for (const { label, method, pathname } of REPRESENTATIVES) {
    it(`${label}: ${method} ${pathname} → отказ, обработчик не вызван`, async () => {
      redis.available = false;
      const result = await callProxy(method, pathname);

      expect(
        result.passedThrough,
        "запрос ушёл в обработчик — значит запись могла произойти, fail-closed не сработал",
      ).toBe(false);
      expect(result.status).toBe(503);
    });
  }

  it("отказ когерентен: конверт проекта, русский текст, Retry-After", async () => {
    redis.available = false;
    const result = await callProxy("POST", "/api/profiles/master");

    expect(result.body).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMIT_UNAVAILABLE" },
    });
    // Сообщение обязано быть на русском (гейт `check:error-message-lang` требует
    // этого от `fail()`; ответ прокси мимо него, поэтому проверяем здесь) и
    // обязано учить повторить, а не «сбавить темп» — запрос был один.
    const message = (result.body as { error: { message: string } }).error.message;
    expect(message).toMatch(/[А-Яа-яЁё]/);
    expect(message).not.toMatch(/много запросов/);
    expect(result.headers.get("Retry-After")).toBe("60");
    expect((result.body as { requestId?: string }).requestId).toBeTruthy();
  });

  it("контроль: не-чувствительный роут при том же обрыве в проде продолжает работать", async () => {
    // Иначе первый тест зеленел бы и на «закрыли вообще всё», то есть перестал
    // бы отличать fail-closed класса от глобального отказа.
    redis.available = false;
    const result = await callProxy("POST", "/api/favorites/toggle");

    expect(result.passedThrough).toBe(true);
    expect(result.status).toBe(200);
  });
});

describe("FIX-B12 · зеркало: с живым Redis роут класса работает, лимит действует", () => {
  for (const { label, method, pathname } of REPRESENTATIVES) {
    it(`${label}: ${method} ${pathname} → проходит и считается`, async () => {
      const result = await callProxy(method, pathname);

      expect(result.passedThrough, "роут класса перестал работать при живом Redis").toBe(true);
      expect(result.status).toBe(200);
      // Лимит не «отключён ради fail-closed»: счётчик вырос, и вырос именно у
      // ключа ЭТОГО роута. Ключ читается обратно, а не собирается здесь заново:
      // тир прокси зависит от метода и пути (`cabinetMutation` vs `publicApi`),
      // и собранный вручную ключ проверял бы формулу теста, а не поведение.
      const [key, ...extra] = [...redis.counters.keys()];
      expect(extra, "лимитер тронул больше одного ключа").toEqual([]);
      expect(key).toContain(toApiRouteTemplate(pathname));
      expect(redis.counters.get(key!)).toBe(1);
    });
  }

  it("превышение бюджета — это 429 RATE_LIMITED, а не 503", async () => {
    // Два состояния отказа не должны слипнуться обратно: 429 учит сбавить темп,
    // 503 — повторить. До FIX-B12 оба рендерились как 429 «Too many requests».
    const method = "POST";
    const pathname = "/api/profiles/master";

    // Первый запрос — чтобы узнать боевой ключ (тир + IP резолвит сам прокси),
    // затем этот ключ выводится за любой бюджет.
    await callProxy(method, pathname);
    const key = [...redis.counters.keys()][0]!;
    redis.counters.set(key, 10_000);

    const result = await callProxy(method, pathname);

    expect(result.passedThrough).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });
});

describe("FIX-B12 · производный пин: класс целиком fail-closed, включая новых соседей", () => {
  for (const { label, subtrees } of CLASS_SUBTREES) {
    it(`${label}: каждый роут поддеревьев отказывает по ключу прокси`, () => {
      const members = ALL_ROUTES.filter((entry) =>
        subtrees.some((prefix) => entry.route === prefix || entry.route.startsWith(`${prefix}/`)),
      );

      // Опечатка в поддереве обнулила бы проверку молча — она бы просто ничего
      // не перебирала и осталась зелёной.
      expect(members.length, `поддеревья класса «${label}» не нашли ни одного роута`).toBeGreaterThan(0);

      const failOpen = members
        .flatMap((entry) =>
          (entry.methods.length > 0 ? entry.methods : ["GET"]).map((method) => ({
            method,
            route: entry.route,
          })),
        )
        .filter(({ method, route }) => !isSensitiveRouteKey(proxyKey(method, route)))
        .map(({ method, route }) => `${method} ${route}`)
        .sort();

      expect(
        failOpen,
        `Роуты класса «${label}» больше не fail-closed (инв. #6). Скорее всего из ` +
          "`SENSITIVE_ROUTE_PREFIXES` убрали префикс — решение владельца FIX-B12 " +
          "требует fail-closed для всего класса: " + failOpen.join(", "),
      ).toEqual([]);
    });
  }
});
