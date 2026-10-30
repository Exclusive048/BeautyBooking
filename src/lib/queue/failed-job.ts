import { logError } from "@/lib/logging/logger";
import { decideRetry } from "@/lib/queue/retry-policy";
import type { Job } from "@/lib/queue/types";

/**
 * WORKER-CATCH-REDIS-SAFE (находка A-08, 2026-10-30) — что воркер делает с
 * задачей, обработчик которой бросил.
 *
 * Повтор и перенос в мёртвые — это ЗАПИСЬ в Redis, и при brownout'е она отказывает
 * так же, как всё остальное (`REDIS_COMMAND_TIMEOUT` или размыкатель FIX-C4).
 * Прежде эти записи стояли в общем `catch` воркера без своей защиты: исключение
 * выходило из `processJob` в `runLoop`, оттуда в `startWorker().catch`, и процесс
 * завершался (`flushAndExit(1)`) — один таймаут в 2,5 с ронял воркер целиком,
 * а пока Redis молчит, рестарт падал на пробе готовности. Вторая половина хуже:
 * `acknowledge` после `catch` шёл БЕЗУСЛОВНО, поэтому если повтор не поставился,
 * а снятие из processing прошло, задача терялась молча.
 *
 * Правило теперь одно: подтверждаем задачу, только если её дальнейшая судьба
 * записана (повтор поставлен или задача в мёртвых). Не записана — задача остаётся
 * в processing, её аренда (heartbeat) перестаёт обновляться, и через
 * `PROCESSING_TIMEOUT_MS` её возвращает `recoverStuckJobs` — штатный путь
 * восстановления, который уже считает такие возвраты и после
 * `MAX_RECOVERY_ATTEMPTS` переводит задачу в мёртвые. Процесс при этом живёт.
 *
 * ⚠️ Таймаут команды не значит, что она не выполнилась: запись могла дойти до
 * Redis, а ответ — потеряться. Тогда в очереди окажутся и повтор, и возвращённая
 * восстановлением копия, и задача выполнится лишний раз. Это та же семантика
 * «как минимум один раз», на которой очередь живёт и без этой правки (§5
 * «Очередь задач»): обработчик обязан быть идемпотентным сам.
 */

export type QueueBookkeepingOperation = "retry" | "dead-letter";

/**
 * Отказ ЗАПИСИ судьбы задачи (повтор, мёртвые), а не самой работы. Воркер
 * заворачивает в него ошибки `enqueue` / `enqueueDeadJob`, чтобы общий `catch`
 * отличил «Redis не принял повтор» от «обработчик упал»: первое повторной
 * постановкой не лечится — следующая запись в тот же молчащий Redis откажет так же.
 */
export class QueueBookkeepingError extends Error {
  readonly operation: QueueBookkeepingOperation;

  constructor(operation: QueueBookkeepingOperation, cause: unknown) {
    super(
      `Queue ${operation} write failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "QueueBookkeepingError";
    this.operation = operation;
  }
}

/** Обёртка записи судьбы задачи: любая ошибка становится `QueueBookkeepingError`. */
export async function recordJobFate(
  operation: QueueBookkeepingOperation,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (error instanceof QueueBookkeepingError) throw error;
    throw new QueueBookkeepingError(operation, error);
  }
}

export type FailedJobDeps = {
  retry: (job: Job, delayMs: number) => Promise<void>;
  deadLetter: (job: Job, error: unknown) => Promise<void>;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logLeftInProcessing(job: Job, error: QueueBookkeepingError): void {
  // `__skipAlert`: молчащий Redis уже сигналит своими алертами (FIX-C4,
  // Telegram при 3+ ошибках в минуту) — второй алерт на каждую задачу дал бы
  // шторм ровно в момент инцидента.
  logError("Worker job left in processing: queue write failed", {
    jobId: job.id,
    type: job.type,
    operation: error.operation,
    error: messageOf(error.cause),
    __skipAlert: true,
  });
}

/**
 * Решает судьбу упавшей задачи и отвечает, можно ли её подтверждать
 * (`acknowledge`). `false` — запись судьбы не прошла, задачу НЕ подтверждать.
 */
export async function settleFailedJob(
  job: Job,
  error: unknown,
  deps: FailedJobDeps,
): Promise<boolean> {
  // Обработчик сам ставил повтор (отложенная задача, напоминание, визуальный
  // поиск…) и упал на записи — вторая попытка записать тот же повтор в тот же
  // Redis ничего не даст, а раньше её исключение и роняло воркер.
  if (error instanceof QueueBookkeepingError) {
    logLeftInProcessing(job, error);
    return false;
  }

  logError("Worker job processing failed", {
    jobId: job.id,
    type: job.type,
    error: messageOf(error),
  });

  // QUEUE-RETRY-POLICY-PER-TYPE: сколько и когда — по таблице типа
  // (`lib/queue/retry-policy.ts`); у типов без своей строки — прежние
  // 60/120/180 с.
  const decision = decideRetry(job);
  try {
    if (decision.kind === "retry") {
      await deps.retry({ ...job, attempts: decision.attempts }, decision.delayMs);
    } else {
      await deps.deadLetter({ ...job, attempts: decision.attempts }, error);
    }
  } catch (writeError) {
    logLeftInProcessing(
      job,
      writeError instanceof QueueBookkeepingError
        ? writeError
        : new QueueBookkeepingError(decision.kind === "retry" ? "retry" : "dead-letter", writeError),
    );
    return false;
  }
  return true;
}
