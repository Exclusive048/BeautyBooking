/**
 * Периодический проход воркера, который не запускается поверх самого себя
 * (YOOKASSA-PENDING-SWEEP, AVAILABLE-TODAY-SWEEP-WRITE, 2026-10-30).
 *
 * `setInterval` в воркере не ждёт предыдущий тик: проход, который при деградации
 * API или базы длится дольше интервала, получал рядом второй такой же — двойную
 * нагрузку ровно на ту зависимость, которая и так отвечает медленно, и (у свипа
 * платежей) две обработки одного платежа сразу. Флаг в памяти процесса: тик,
 * пришедший, пока проход идёт, пропускается, а не ставится в очередь — следующий
 * тик интервала всё равно придёт. Между процессами (несколько реплик воркера)
 * флаг не действует — там нужна иная защита (у платежей это условная запись
 * исхода по статусу строки).
 */
export type NoOverlapResult<T> = { ran: true; value: T } | { ran: false };

export function createNoOverlapRunner<T>(
  task: () => Promise<T>,
): () => Promise<NoOverlapResult<T>> {
  let running = false;
  return async () => {
    if (running) return { ran: false };
    running = true;
    try {
      return { ran: true, value: await task() };
    } finally {
      running = false;
    }
  };
}
