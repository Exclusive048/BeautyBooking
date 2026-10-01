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
 * 2. **Недоступная зависимость не отменяет работу и не добавляет ожидания.**
 *    🔴 Прежняя редакция этого правила была ЛОЖНОЙ про зависимость и стоила
 *    launch-блокера (FIX-C11): она утверждала, что `setNx` возвращает `false`,
 *    «когда команда не прошла». Не возвращает — он логирует и **бросает**
 *    (`redisClient.ts:141-144`), потому что для замка «взят» и «не смогли
 *    посчитать» различать обязательно. Отказ уходил мимо обоих правил, и при
 *    остановленном Redis `/slots`, `/booking-days` и `/availability` отвечали
 *    **500**: каталог при этом отвечал 200, поэтому обрыв читался как
 *    переживаемый, а гость не доходил до кнопки отправки.
 *    Теперь третье состояние приходит явным `status: "unavailable"`
 *    (`cache.claimLock`), и ответ на него — **пропустить замок и посчитать**:
 *    дедупликация между параллельными запросами и есть то, ради чего замок
 *    существует, и заплатить за её потерю во время обрыва — верный размен.
 * 3. **Замок снимается всегда** — `finally`, и его TTL сам по себе короткий:
 *    процесс, упавший с замком в руках, задержит остальных максимум на
 *    `lockTtlSeconds`, а не навсегда. Снятие идёт `cache.del`, который при
 *    обрыве не бросает (см. таблицу контракта в §11 контекста), поэтому
 *    `finally` не может превратить успешный расчёт в отказ.
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
  /** Шаг опроса проигравшим. 25 мс — для дешёвых расчётов; долгому (вызов ИИ) хватит и 250. */
  pollIntervalMs?: number;
};

export async function withSingleFlight<T>(input: SingleFlightInput<T>): Promise<T> {
  const lockTtl = input.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  const waitMs = input.waitMs ?? DEFAULT_WAIT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? POLL_INTERVAL_MS;

  const claim = await cache.claimLock(input.lockKey, "1", lockTtl);

  if (claim.status === "acquired") {
    try {
      return await input.compute();
    } finally {
      await cache.del(input.lockKey);
    }
  }

  // Правило 2: замка нет, потому что зависимость недоступна. Ни ждать (держателя
  // не существует), ни отказывать (работа выполнима) — считаем немедленно и без
  // замка. Единственная потеря — дедупликация параллельных пересчётов, то есть
  // ровно та выгода, которую замок и даёт: во время обрыва она не стоит отказа.
  if (claim.status === "unavailable") return input.compute();

  // Замок наблюдался занятым — но мог быть снят, пока мы шли сюда.
  const holder = await cache.get<string>(input.lockKey);
  if (holder === null) return input.compute();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const value = await input.read();
    if (value !== null) return value;
    // Держатель снял замок, не записав значения (упал или ему нечего писать) —
    // ждать нечего. Без этого долгое ожидание (сводка отзывов — 35 с) после
    // отказа победителя превращалось в 35 с тишины у каждого проигравшего.
    // Обрыв Redis здесь читается как «замка нет» (`get` → null) — то же правило 2.
    if ((await cache.get<string>(input.lockKey)) === null) return input.compute();
  }

  // Правило 1: не дождались — считаем сами, дубль дешевле отказа.
  return input.compute();
}
