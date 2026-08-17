import "server-only"; // GUARDRAILS-01: redis root (pulls node:net/tls) — hard-fail if it reaches a client bundle
import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { logError, logInfo } from "@/lib/logging/logger";
import { env } from "@/lib/env";

type RedisClient = RedisClientType;
type RedisTimeoutError = Error & {
  code: "REDIS_COMMAND_TIMEOUT";
  operation: string;
  timeoutMs: number;
};

const REDIS_URL = env.REDIS_URL?.trim() ?? "";
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 2_500;

// Use globalThis to survive HMR module reloads in dev — same pattern as Prisma singleton.
const g = globalThis as typeof globalThis & {
  __bhRedisCommand: Promise<RedisClient | null> | null | undefined;
  __bhRedisSubscriber: Promise<RedisClient | null> | null | undefined;
};
if (g.__bhRedisCommand === undefined) g.__bhRedisCommand = null;
if (g.__bhRedisSubscriber === undefined) g.__bhRedisSubscriber = null;

const REDIS_CONNECT_TIMEOUT_MS =
  env.REDIS_CONNECT_TIMEOUT_MS ?? DEFAULT_REDIS_CONNECT_TIMEOUT_MS;
const REDIS_COMMAND_TIMEOUT_MS =
  env.REDIS_COMMAND_TIMEOUT_MS ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS;

function createRedisTimeoutError(operation: string, timeoutMs: number): RedisTimeoutError {
  const error = new Error(
    `Redis command timeout: operation=${operation}, timeoutMs=${timeoutMs}`
  ) as RedisTimeoutError;
  error.code = "REDIS_COMMAND_TIMEOUT";
  error.operation = operation;
  error.timeoutMs = timeoutMs;
  return error;
}

/**
 * FIX-C4 — размыкатель поверх покомандного дедлайна.
 *
 * ## Почему одного дедлайна мало (замер, а не рассуждение)
 *
 * RES-01 ограничил КАЖДУЮ команду 2.5 с, и это верно для команды. Но страница
 * делает их несколько подряд, и граница складывается: измерено стендом
 * `lib/testing/silent-redis.ts` — **четыре последовательных `cache.get` при
 * молчащем Redis стоили 10.04 с** (4 × 2.5 с, ровно аддитивно). Отсюда и
 * наблюдавшиеся на витрине 9.2 / 14.0 / 20.9 с (`SMOKE-01 · F5`): это не одна
 * медленная команда, а четыре, шесть и восемь тихих.
 *
 * ⚠️ Прокси к этому отношения не имеет, вопреки записи в F5: `resolveRateLimitTier`
 * возвращает `null` для всего, что не `/api/*`, то есть **страницы лимитер не
 * трогают вовсе** и Redis в прокси на них не дёргается. Стоимость целиком в
 * SSR-загрузчиках.
 *
 * Уменьшать константу бессмысленно: она уже выбрана под здоровый Redis, а
 * складывается всё равно. Нужен другой контроль — «не спрашивать снова то, что
 * только что молчало».
 *
 * ## Что делает и чего НЕ делает
 *
 * После `CONSECUTIVE_TIMEOUTS_TO_OPEN` подряд истёкших команд размыкатель
 * открывается на `OPEN_MS`, и в это время команды отклоняются **немедленно** —
 * тем же самым `REDIS_COMMAND_TIMEOUT`-объектом, что и при настоящем истечении.
 * Это ключевое свойство: ни один вызывающий не отличает быстрый отказ от
 * медленного, поэтому **решение остаётся прежним** (cache-miss там, где был
 * miss; 503 там, где fail-closed; throw у `setNx`) — меняется только время
 * ожидания. Политики fail-open/fail-closed из FIX-B12 и SEC-04 не затронуты
 * ни на одном роуте, и затронуты быть не могут: их код даже не знает о
 * размыкателе.
 *
 * Открывают его ТОЛЬКО таймауты. Обычная ошибка Redis (WRONGTYPE, NOSCRIPT)
 * приходит мгновенно и означает дефект запроса, а не молчание зависимости —
 * такие ответы счётчик сбрасывают, как и успех.
 *
 * Полуоткрытое состояние: по истечении `OPEN_MS` ОДНА команда пропускается на
 * пробу. Успела — размыкается насовсем; снова истекла — окно продлевается.
 * Поэтому восстановление не ждёт трафика особого вида и укладывается в те же
 * ~4 с, за которые Redis поднимается (наблюдение `SMOKE-01`).
 */
/**
 * 🔴 FIX-D1 — понижено с 2 до 1, и это ПРОВИЗОРНОЕ значение.
 *
 * Двойка выбиралась против стендовой оценки «обнаружение до 5 с». Живой замер
 * (SMOKE-02, реальная остановка Redis) дал другую величину: **7.63 с + 2.61 с ≈
 * 10.2 с на два первых запроса**, то есть решение принималось против числа,
 * которого нет. Порог 1 половинит видимый стопор: размыкатель открывается после
 * ПЕРВОЙ истёкшей команды.
 *
 * Цена ложного срабатывания — холодный кэш на `CIRCUIT_OPEN_MS` (5 с) плюс одна
 * проба ценой 250 мс. При трафике закрытого деплоя это пренебрежимо; при боевом
 * трафике размен меняется, потому что одна случайно медленная команда начнёт
 * гасить кэш всему процессу.
 *
 * ⚠️ **Пересмотреть после живого замера под реальным трафиком** — значение
 * выбрано против заведомо неполного числа и записано таким в
 * `docs/runbooks/redis-down.md`. Не «настраивать по ощущению»: менять только с
 * новым замером на руках.
 */
const CONSECUTIVE_TIMEOUTS_TO_OPEN = 1;
const CIRCUIT_OPEN_MS = 5_000;
/**
 * Бюджет ПРОБЫ в полуоткрытом состоянии — намеренно много меньше обычного.
 *
 * Здоровый Redis отвечает за доли миллисекунды; 2.5 с — это запас на дурную
 * сеть, а не ожидаемое время. Пока размыкатель разомкнут, проба лежит на
 * запросе ПОЛЬЗОВАТЕЛЯ, и платить за неё полный бюджет значит возвращать ровно
 * ту боль, ради которой размыкатель заведён: витрина снова получала бы
 * многосекундные всплески, только реже.
 *
 * С 250 мс устойчивый отказ стоит так: один раз 2 × 2.5 с на обнаружение,
 * дальше по 250 мс раз в 5 с, остальные запросы — мгновенный промах.
 */
const CIRCUIT_PROBE_TIMEOUT_MS = 250;

const circuit = {
  consecutiveTimeouts: 0,
  /** Время, до которого команды отклоняются немедленно. */
  openUntilMs: 0,
  /** Проба в полуоткрытом состоянии уже в полёте. */
  probing: false,
};

/** Наблюдаемость размыкателя для тестов и диагностики. */
export function getRedisCircuitState(): { open: boolean; consecutiveTimeouts: number } {
  return {
    open: Date.now() < circuit.openUntilMs,
    consecutiveTimeouts: circuit.consecutiveTimeouts,
  };
}

/** Только для тестов: вернуть размыкатель в исходное состояние. */
export function resetRedisCircuit(): void {
  circuit.consecutiveTimeouts = 0;
  circuit.openUntilMs = 0;
  circuit.probing = false;
}

function onCommandSettled(timedOut: boolean): void {
  if (!timedOut) {
    circuit.consecutiveTimeouts = 0;
    circuit.openUntilMs = 0;
    circuit.probing = false;
    return;
  }
  circuit.consecutiveTimeouts += 1;
  circuit.probing = false;
  if (circuit.consecutiveTimeouts >= CONSECUTIVE_TIMEOUTS_TO_OPEN) {
    circuit.openUntilMs = Date.now() + CIRCUIT_OPEN_MS;
  }
}

export type RedisCommandOptions = {
  /**
   * Команда НАБЛЮДАЕТ состояние зависимости, а не пользуется ею.
   *
   * 🔴 Заведено не для удобства, а по найденному дефекту: health-проба
   * (`lib/health/probe.ts`) с общим размыкателем начала возвращать `redis:
   * "down"` из его памяти, ни разу не обратившись к Redis, — то есть
   * докладывала ВЕРДИКТ вместо ИЗМЕРЕНИЯ и продолжала бы докладывать до пяти
   * секунд после фактического восстановления. Это зеркало урока FIX-C2: там
   * проба ждала зависимость, о падении которой сообщала, здесь — перестала бы
   * её спрашивать вовсе.
   *
   * Наблюдатель размыкатель и не читает, и не двигает: его собственный бюджет
   * (2 с) отличается от командного, и кормить им общий счётчик значило бы
   * позволить диагностике гасить кэш всему процессу.
   */
  observeOnly?: boolean;
};

export function withRedisCommandTimeout<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs = REDIS_COMMAND_TIMEOUT_MS,
  options?: RedisCommandOptions,
): Promise<T> {
  if (options?.observeOnly) {
    let observerTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const observerTimeout = new Promise<never>((_, reject) => {
      observerTimeoutId = setTimeout(() => {
        reject(createRedisTimeoutError(operation, timeoutMs));
      }, timeoutMs);
    });
    return Promise.race([promise, observerTimeout]).finally(() => {
      if (observerTimeoutId) clearTimeout(observerTimeoutId);
    });
  }

  const isOpen = Date.now() < circuit.openUntilMs;
  const isTripped = circuit.consecutiveTimeouts >= CONSECUTIVE_TIMEOUTS_TO_OPEN;

  // Отказываем немедленно, пока окно не истекло, и пока проба уже в полёте.
  // Промис самой команды не трогаем — отменить его нельзя; `redis@5` держит её
  // в offline-очереди и разрешит сам при реконнекте. `catch` навешивается,
  // чтобы отказ не всплыл как `unhandledRejection` и не уронил процесс.
  if (isOpen || (isTripped && circuit.probing)) {
    void promise.catch(() => undefined);
    return Promise.reject(createRedisTimeoutError(operation, 0));
  }

  // Окно истекло, но размыкатель ещё не закрыт — эта команда идёт пробой и
  // получает укороченный бюджет: она лежит на запросе пользователя.
  const isProbe = isTripped;
  if (isProbe) circuit.probing = true;
  const effectiveTimeoutMs = isProbe ? Math.min(CIRCUIT_PROBE_TIMEOUT_MS, timeoutMs) : timeoutMs;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createRedisTimeoutError(operation, effectiveTimeoutMs));
    }, effectiveTimeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .then(
      (value) => {
        onCommandSettled(false);
        return value;
      },
      (error: unknown) => {
        const timedOut =
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "REDIS_COMMAND_TIMEOUT";
        onCommandSettled(timedOut);
        throw error;
      },
    )
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
}

function buildClient(role: "command" | "subscriber"): RedisClient {
  const client: RedisClient = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy(retries) {
        return Math.min(retries * 100, 2000);
      },
    },
  });

  client.on("error", (error: unknown) => {
    logError("Redis client error", {
      role,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  client.on("connect", () => {
    logInfo("Redis client connected", { role });
  });
  client.on("reconnecting", () => {
    logInfo("Redis client reconnecting", { role });
  });
  client.on("end", () => {
    logInfo("Redis client disconnected", { role });
  });

  return client;
}

async function getOrCreateClient(
  role: "command" | "subscriber"
): Promise<RedisClient | null> {
  if (!REDIS_URL) return null;
  const current = role === "subscriber" ? g.__bhRedisSubscriber : g.__bhRedisCommand;
  if (!current) {
    const promise = (async () => {
      const client = buildClient(role);
      try {
        await withRedisCommandTimeout(
          `redis:${role}:connect`,
          client.connect(),
          REDIS_CONNECT_TIMEOUT_MS
        );
        return client;
      } catch (error) {
        void client.disconnect().catch(() => undefined);
        logError("Redis connection failed", {
          role,
          error: error instanceof Error ? error.message : String(error),
        });
        if (role === "subscriber") {
          g.__bhRedisSubscriber = null;
        } else {
          g.__bhRedisCommand = null;
        }
        return null;
      }
    })();
    if (role === "subscriber") {
      g.__bhRedisSubscriber = promise;
    } else {
      g.__bhRedisCommand = promise;
    }
  }
  return role === "subscriber" ? g.__bhRedisSubscriber! : g.__bhRedisCommand!;
}

export async function getRedisConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("command");
}

export async function getRedisSubscriberConnection(): Promise<RedisClient | null> {
  return getOrCreateClient("subscriber");
}
