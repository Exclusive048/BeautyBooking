import type { Job } from "@/lib/queue/types";

/**
 * QUEUE-RETRY-POLICY-PER-TYPE (2026-10-30) — сколько раз и с какими паузами
 * воркер повторяет упавшую задачу. Одна таблица на все типы: до неё у каждого
 * пути была своя арифметика (общий `catch` — 60/120/180 с, Telegram, ВК,
 * визуальный поиск и push — `min(60, 2^n)` с, напоминания — своя копия общего),
 * и самые дорогие отказы жили на самом коротком расписании.
 *
 * Что изменилось против прежнего (остальные типы — БАЙТ В БАЙТ как было):
 *  - `yookassa.webhook` — ~23 ч. ЮКасса повторяет уведомление сама, но
 *    авторитетна для нас НАША задача (инв. #5: воркер перечитывает платёж по
 *    API), и шесть минут прежнего расписания означали, что сбой API ЮКассы или
 *    базы дольше шести минут оставлял оплаченную подписку неактивной до
 *    ручного «повторить» из мёртвых (находка A-02). Пропущенное уведомление
 *    добирает ещё и свип PENDING-платежей (YOOKASSA-PENDING-SWEEP).
 *  - `media.purge` — ~24 ч. Удаление ПДн из хранилища: недоступное хранилище
 *    (прецедент — приостановленный аккаунт Object Storage) лежит часами, а не
 *    минутами, и через шесть минут задача умирала, оставляя байты удалённого
 *    аккаунта (находка A-04).
 *  - `push.native.send` — 10/30/60/120/300 с: временный сбой FCM/APNs/RuStore
 *    (429, 5xx) за 30 секунд прежнего расписания не проходит.
 *
 * Чего здесь нет: решения «повторять ли вообще». Его принимает обработчик
 * (`vk.send` не повторяет отказ по получателю, визуальный поиск — отсутствующий
 * файл); таблица отвечает только на «когда и сколько».
 *
 * `Job.maxAttempts` в метаданных задачи этой таблицей НЕ читается: его никто не
 * задавал иначе, чем по умолчанию (5), а два источника правды о числе повторов
 * — ровно то, что эта таблица убирает.
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** Общий путь: исключение из обработчика (`processJob`) и напоминания — как было. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1, 2, 3].map((n) => n * MINUTE_MS);

/** Telegram, ВК, визуальный поиск — прежнее `min(60, 2^n)` с при пяти попытках. */
const SHORT_EXPONENTIAL_DELAYS_MS: readonly number[] = [2, 4, 8, 16].map((n) => n * SECOND_MS);

export const RETRY_DELAYS_MS: Partial<Record<Job["type"], readonly number[]>> = {
  "telegram.send": SHORT_EXPONENTIAL_DELAYS_MS,
  "vk.send": SHORT_EXPONENTIAL_DELAYS_MS,
  visual_search_index: SHORT_EXPONENTIAL_DELAYS_MS,
  "push.native.send": [10, 30, 60, 120, 300].map((n) => n * SECOND_MS),
  // 1 + 2 + 5 + 10 + 30 мин + 1 + 2 + 3 + 4 × 4 ч ≈ 22 ч 48 мин.
  "yookassa.webhook": [
    1 * MINUTE_MS,
    2 * MINUTE_MS,
    5 * MINUTE_MS,
    10 * MINUTE_MS,
    30 * MINUTE_MS,
    1 * HOUR_MS,
    2 * HOUR_MS,
    3 * HOUR_MS,
    4 * HOUR_MS,
    4 * HOUR_MS,
    4 * HOUR_MS,
    4 * HOUR_MS,
  ],
  // 5 + 15 + 30 мин + 1 + 2 + 4 + 8 + 8 ч ≈ 23 ч 50 мин.
  "media.purge": [
    5 * MINUTE_MS,
    15 * MINUTE_MS,
    30 * MINUTE_MS,
    1 * HOUR_MS,
    2 * HOUR_MS,
    4 * HOUR_MS,
    8 * HOUR_MS,
    8 * HOUR_MS,
  ],
};

export function retryDelaysFor(type: Job["type"]): readonly number[] {
  return RETRY_DELAYS_MS[type] ?? DEFAULT_RETRY_DELAYS_MS;
}

export type RetryDecision =
  | { kind: "retry"; attempts: number; delayMs: number }
  | { kind: "dead"; attempts: number };

/**
 * Решение по очередному отказу задачи. `attempts` в ответе — сколько раз задача
 * уже упала с учётом этого раза; его и пишут в задачу (и в мёртвую тоже).
 */
export function decideRetry(job: Pick<Job, "type" | "attempts">): RetryDecision {
  const attempts = (job.attempts ?? 0) + 1;
  const delays = retryDelaysFor(job.type);
  if (attempts <= delays.length) {
    return { kind: "retry", attempts, delayMs: delays[attempts - 1] };
  }
  return { kind: "dead", attempts };
}
