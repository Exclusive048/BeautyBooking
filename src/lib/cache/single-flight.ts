import * as cache from "@/lib/cache/cache";

/**
 * PERF-10 — single-flight поверх шаблона «get → (промах) → compute → set».
 *
 * Шаблон встречается в четырёх местах и ни в одном не имел замка: на истечении
 * TTL горячего ключа полный пересчёт запускают ВСЕ параллельные запросы. У
 * слотов TTL 120 с, то есть у популярного мастера при 20 rps момент истечения
 * стоит двадцати одинаковых пересчётов подряд. `setNx` в проекте есть, но
 * использовался только для идемпотентности и дедупа джоб — ни разу для
 * заполнения кэша.
 *
 * Три правила, из которых состоит вся осторожность этой функции:
 *
 * 1. **Замок никогда не отменяет ответ.** Проигравший ждёт ОГРАНИЧЕННОЕ время
 *    и, если значение так и не появилось, считает сам. Хуже посчитать дважды,
 *    чем не ответить.
 * 2. **Недоступный Redis не должен добавлять ожидание.** `setNx` возвращает
 *    `false` и когда замок занят, и когда команда не прошла (RES-01: таймаут
 *    трактуется как отказ). Различить их можно только одним способом —
 *    посмотреть, лежит ли замок на самом деле. Если его не видно, ждать
 *    некого: считаем немедленно. При brownout'е этот `get` тоже отвечает
 *    промахом (быстро, по таймауту команды), то есть деградация — «как было
 *    до фикса», а не «плюс полсекунды к каждому запросу».
 * 3. **Замок снимается всегда** — `finally`, и его TTL сам по себе короткий:
 *    процесс, упавший с замком в руках, задержит остальных максимум на
 *    `lockTtlSeconds`, а не навсегда.
 */

const DEFAULT_LOCK_TTL_SECONDS = 10;
const DEFAULT_WAIT_MS = 300;
const POLL_INTERVAL_MS = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SingleFlightInput<T> = {
  /** Ключ ЗАМКА (не ключ значения) — разные пространства имён во избежание коллизии. */
  lockKey: string;
  /** Перечитать значение из кэша. `null` = его там всё ещё нет. */
  read: () => Promise<T | null>;
  /** Посчитать и записать значение. Вызывается победителем — или проигравшим, который не дождался. */
  compute: () => Promise<T>;
  lockTtlSeconds?: number;
  waitMs?: number;
};

export async function withSingleFlight<T>(input: SingleFlightInput<T>): Promise<T> {
  const lockTtl = input.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  const waitMs = input.waitMs ?? DEFAULT_WAIT_MS;

  const acquired = await cache.setNx(input.lockKey, "1", lockTtl);
  if (acquired) {
    try {
      return await input.compute();
    } finally {
      await cache.del(input.lockKey);
    }
  }

  // Правило 2: замок не наблюдается — значит либо его уже сняли, либо Redis
  // недоступен. В обоих случаях ждать нечего.
  const holder = await cache.get<string>(input.lockKey);
  if (holder === null) return input.compute();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const value = await input.read();
    if (value !== null) return value;
  }

  // Правило 1: не дождались — считаем сами, дубль дешевле отказа.
  return input.compute();
}
