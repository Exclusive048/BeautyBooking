/**
 * FIX-C4 — общий стенд «Redis подключился и замолчал».
 *
 * ## Зачем он есть
 *
 * Дефект этого класса найден дважды подряд живым прогоном и ни разу — тестом
 * (`/api/health` в `SMOKE-01 · F2`, витрина в `F5`). Причина структурная: юнит-
 * тесты моделируют **отказ** Redis, а боевой механизм — **молчание**.
 *
 * `redis@5` не выставляет `disableOfflineQueue`, а `reconnectStrategy` проекта
 * не сдаётся никогда (`Math.min(retries * 100, 2000)`). Во время реконнекта
 * `socket.isOpen` остаётся `true`, поэтому `sendCommand` промис **не
 * отклоняет** — команда уходит в offline-очередь ждать соединения, которого не
 * будет. Отклонения нет. Есть отсутствие ответа.
 *
 * Отсюда два следствия, которые и делают класс невидимым:
 *   1. `try/catch` вокруг команды инертен — ловить нечего;
 *   2. мок вида `ping: () => { throw new Error("ECONNREFUSED") }` зеленеет на
 *      сломанном коде, потому что отказ приходит МГНОВЕННО и любой вызывающий
 *      его переживает.
 *
 * Единственное, что может закончить такую команду, — собственный дедлайн
 * вызывающего. Это и есть предмет проверки, поэтому стенд возвращает промисы,
 * которые не резолвятся и не отклоняются.
 *
 * Прямой аналог `lib/testing/hanging-fetch.ts`, построенного FIX-B10 для той же
 * проблемы на HTTP-стороне.
 *
 * ⚠️ **Таймеры НЕ подменяются** — по той же причине, что и там: дедлайн есть
 * предмет проверки, а поддельный таймер показал бы зелёное и при мёртвом
 * дедлайне, то есть ровно ту дыру, которую файл закрывает. Цена честности —
 * реальное ожидание; вызовы в тестах пускать параллельно, а не подряд.
 */

export type SilentRedisHandle = {
  /** Подставляется вместо результата `getRedisConnection()`. */
  client: Record<string, (...args: unknown[]) => Promise<never>>;
  /** Сколько команд дошло до стенда — отличает «повисло» от «не позвали». */
  commandCount: () => number;
  /** Имена вызванных команд по порядку. */
  commands: () => string[];
  /** Снимает висящие промисы, чтобы не течь между тестами. */
  release: () => void;
};

/** Команды, которыми проект пользуется. Новую достаточно добавить сюда. */
const REDIS_COMMANDS = [
  "get",
  "set",
  "del",
  "ping",
  "scan",
  "sAdd",
  "sMembers",
  "expire",
  "incr",
  "publish",
  "subscribe",
  "unsubscribe",
  "lPush",
  "rPush",
  "lRem",
  "lRange",
  "lLen",
  "hSet",
  "hGetAll",
  "eval",
  "multi",
] as const;

export function createSilentRedis(): SilentRedisHandle {
  let count = 0;
  const seen: string[] = [];
  const pending = new Set<(reason: unknown) => void>();

  const client = {} as SilentRedisHandle["client"];
  for (const name of REDIS_COMMANDS) {
    client[name] = () => {
      count += 1;
      seen.push(name);
      // Ни resolve, ни reject — НИКОГДА. Вызывающий без дедлайна повиснет, и
      // тест упадёт по своему таймауту: это и есть «сторож умеет покраснеть».
      return new Promise<never>((_resolve, reject) => {
        pending.add(reject);
      });
    };
  }

  return {
    client,
    commandCount: () => count,
    commands: () => [...seen],
    release: () => {
      for (const reject of pending) reject(new Error("silent-redis released"));
      pending.clear();
    },
  };
}
