import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

/**
 * FIX-C2 · SMOKE-01 · F2 — health-пробы отвечают ВСЕГДА и в пределах дедлайна,
 * и различают, какая именно зависимость лежит.
 *
 * ## Воспроизведение дефекта
 *
 * Боевой отказ — НЕ отклонённый промис. `redis@5` во время реконнекта держит
 * `socket.isOpen === true` и кладёт команду в offline-очередь: `ping()` не
 * резолвится и не отклоняется НИКОГДА. Тест, мокающий `ping` как `throw`,
 * зеленел бы и на сломанном коде — поэтому здесь `ping` возвращает **вечный
 * промис**, ровно как стенд `lib/testing/hanging-fetch.ts` делает для HTTP.
 *
 * Таймеры НЕ подменяются (то же обоснование, что в шапке стенда): дедлайн —
 * предмет проверки, а поддельный таймер показал бы зелёное и при мёртвом
 * дедлайне. Цена — реальное ожидание в 2 с на два теста; они идут параллельно.
 *
 * @probe   что сломать: в `lib/health/probe.ts` заменить обёртку
 *          `withRedisCommandTimeout("health:redis", …)` на голый `await`
 *          внутренней функции.
 *          наблюдалось: «Test timed out in 5000ms» на «readiness отвечает, когда
 *          Redis не отвечает никогда» — то есть ровно боевой симптом F2
 *          (зависание, а не ошибка), а не абстрактное «не равно».
 *          восстановлено, `diff` с бэкапом пуст, зелено.
 */

const HANGS_FOREVER = () => new Promise<never>(() => {});

const state = vi.hoisted(() => ({
  redisPing: null as null | (() => Promise<unknown>),
  redisClientOrNull: "client" as "client" | null,
  dbQuery: null as null | (() => Promise<unknown>),
  redisUrl: "redis://localhost:6379" as string | undefined,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: () => (state.dbQuery ?? (async () => [{ x: 1 }]))(),
  },
}));

vi.mock("@/lib/redis/connection", async () => {
  // `withRedisCommandTimeout` НЕ мокается: это и есть проверяемая машинерия.
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>(
    "@/lib/redis/connection",
  );
  return {
    ...actual,
    getRedisConnection: async () =>
      state.redisClientOrNull === null
        ? null
        : { ping: state.redisPing ?? (async () => "PONG") },
  };
});

vi.mock("@/lib/env", () => ({
  env: {
    get REDIS_URL() {
      return state.redisUrl;
    },
  },
  isProduction: false,
}));

const { checkReadiness, HEALTH_DEPENDENCY_TIMEOUT_MS } = await import("@/lib/health/probe");
const { GET: readyGET } = await import("@/app/api/health/ready/route");
const { GET: liveGET } = await import("@/app/api/health/route");

function resetState() {
  state.redisPing = null;
  state.redisClientOrNull = "client";
  state.dbQuery = null;
  state.redisUrl = "redis://localhost:6379";
}

describe("FIX-C2 · проба отвечает, когда зависимость не отвечает", () => {
  it("readiness отвечает, когда Redis не отвечает никогда", async () => {
    resetState();
    state.redisPing = HANGS_FOREVER;

    const startedAt = Date.now();
    const response = await readyGET();
    const elapsed = Date.now() - startedAt;
    const body = await response.json();

    expect(
      elapsed,
      "проба не уложилась в собственный дедлайн — это и есть F2: длительность " +
        "определяется терпением клиента, а не свойством сервера",
    ).toBeLessThan(HEALTH_DEPENDENCY_TIMEOUT_MS + 1_500);
    expect(response.status).toBe(503);
    expect(body.dependencies).toEqual({ db: "ok", redis: "down" });
    expect(body.status).toBe("degraded");
  });

  it("readiness отвечает, когда БД не отвечает никогда", async () => {
    resetState();
    state.dbQuery = HANGS_FOREVER;

    const startedAt = Date.now();
    const response = await readyGET();
    const elapsed = Date.now() - startedAt;
    const body = await response.json();

    expect(elapsed).toBeLessThan(HEALTH_DEPENDENCY_TIMEOUT_MS + 1_500);
    expect(response.status).toBe(503);
    expect(body.dependencies).toEqual({ db: "down", redis: "ok" });
  });

  it("«Redis лежит, БД жива» и «лежит всё» — различимы", async () => {
    // Единственная ценность пробы для дежурного. Сведённый флаг `ok:false`
    // в обоих случаях одинаков, поэтому предметом взят состав `dependencies`.
    resetState();
    state.redisPing = HANGS_FOREVER;
    const redisOnly = await checkReadiness();

    resetState();
    state.redisPing = HANGS_FOREVER;
    state.dbQuery = HANGS_FOREVER;
    const both = await checkReadiness();

    expect(redisOnly.db).toBe("ok");
    expect(both.db).toBe("down");
    expect({ db: redisOnly.db, redis: redisOnly.redis }).not.toEqual({
      db: both.db,
      redis: both.redis,
    });
  });

  it("отсутствие REDIS_URL — это `disabled`, а не авария", async () => {
    resetState();
    state.redisUrl = "";

    const response = await readyGET();
    const body = await response.json();

    expect(body.dependencies.redis).toBe("disabled");
    expect(response.status, "легитимная dev-конфигурация не должна читаться как отказ").toBe(200);
  });

  it("всё здорово — 200 и обе зависимости ok", async () => {
    resetState();
    const response = await readyGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dependencies).toEqual({ db: "ok", redis: "ok" });
    expect(typeof body.checkedInMs).toBe("number");
  });
});

describe("FIX-C2 · liveness не трогает зависимости", () => {
  it("отвечает 200 даже когда обе зависимости висят", async () => {
    resetState();
    state.redisPing = HANGS_FOREVER;
    state.dbQuery = HANGS_FOREVER;

    const response = await liveGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("live");
  });

  it("не выполняет ввода-вывода — проверяется свойство, а не скорость", () => {
    // 🔴 Замер времени здесь был бы негодным сторожем: быстрый ответ бывает и у
    // пробы, которая ходит в живой Redis. Предмет — отсутствие самой
    // возможности: модуль не импортирует ни один источник зависимостей.
    const source = readFileSync(
      join(process.cwd(), "src/app/api/health/route.ts"),
      "utf8",
    );
    const forbidden = [
      "@/lib/prisma",
      "@/lib/redis/connection",
      "@/lib/cache",
      "@/lib/queue",
      "@/lib/health/probe",
    ].filter((mod) => source.includes(`from "${mod}`));

    expect(
      forbidden,
      "liveness-проба получила доступ к зависимости: проба, обращающаяся к тому, " +
        "о чьей аварии она сообщает, становится частью аварии — это и есть F2. " +
        `Готовность живёт в /api/health/ready: ${forbidden.join(", ")}`,
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Контракт с автоматами: сменился смысл — обязаны смениться потребители.
 * ------------------------------------------------------------------ */

describe("FIX-C2 · потребители согласованы с новым контрактом", () => {
  const compose = readFileSync(join(process.cwd(), "docker-compose.prod.yml"), "utf8");
  const deploy = readFileSync(join(process.cwd(), ".github/workflows/deploy.yml"), "utf8");

  it("compose-проба смотрит на liveness", () => {
    expect(compose).toMatch(/127\.0\.0\.1:3000\/api\/health'/);
  });

  it("deploy гейтит откат готовностью БД, а не только живостью", () => {
    // Без этого шага смена смысла `/api/health` была бы регрессией: образ с
    // неверным DATABASE_URL проходил бы деплой как здоровый.
    expect(deploy).toContain("/api/health/ready");
    expect(deploy).toMatch(/"db":"ok"/);
  });

  it("откат НЕ гейтится состоянием Redis", () => {
    // Ратифицировано: откат на `:previous` лежащий Redis не чинит.
    const rollbackOnRedis = /rollback_and_fail[^\n]*redis/i.test(deploy);
    expect(
      rollbackOnRedis,
      "деплой откатывается из-за Redis — откат этого не чинит, на старом образе " +
        "Redis лежит так же",
    ).toBe(false);
  });

  it("health-пробы изъяты из rate-limit тира, гейтящиеся секретом — нет", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain('HEALTH_LIVENESS_PATH = "/api/health"');
    expect(proxy).toContain('HEALTH_READINESS_PATH = "/api/health/ready"');
    // Секретные пробы обязаны остаться под лимитом — иначе секрет открыт перебору.
    expect(proxy).not.toContain('"/api/health/status"');
    expect(proxy).not.toContain('"/api/health/worker"');
  });
});
