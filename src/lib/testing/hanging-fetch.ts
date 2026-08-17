/**
 * GUARD-INTEGRITY (FIX-B10) — общий стенд «висящий внешний сервис».
 *
 * Зачем он есть. Пять сторожей дедлайнов проверяли ФОРМУ кода, а не поведение:
 * `signal instanceof AbortSignal` зелен и тогда, когда сигнал бесконечен, а
 * регексп по исходнику — и тогда, когда константа до `fetch` не доходит вовсе.
 * Инвариант #43 называет этот класс: сторож обязан уметь покраснеть.
 *
 * Что моделируется. Зависший хост — это НЕ отказ: отказ (`ECONNREFUSED`,
 * `HTTP 500`) приходит мгновенно, и тест на нём зеленел бы, ничего не проверив.
 * Зависание — соединение принято, ответа нет никогда. Единственное, что может
 * такой запрос закончить, — собственный дедлайн вызывающего.
 *
 * Контракт стенда — ровно контракт настоящего `fetch`:
 *   • сигнала нет            → промис НЕ резолвится никогда. Вызывающий без
 *                              дедлайна повиснет, и тест упадёт по своему
 *                              таймауту. Это и есть «сторож умеет покраснеть».
 *   • сигнал есть            → промис отклоняется в момент `abort`, значением
 *                              `signal.reason` (для `AbortSignal.timeout` это
 *                              `DOMException: TimeoutError`) — как настоящий
 *                              `fetch`, а не абстрактным `new Error()`.
 *   • сигнал уже сработал    → отклоняется немедленно.
 *
 * ⚠️ Намеренно НЕ мокается таймер. `AbortSignal.timeout()` живёт в нативном
 * слое Node и мимо `globalThis.setTimeout`, поэтому `vi.useFakeTimers()` его не
 * двигает — подменённый таймер дал бы зелёный тест при мёртвом дедлайне, то
 * есть ровно ту дыру, которую этот файл закрывает. Цена честности — реальное
 * ожидание, поэтому вызовы в тестах запускаются параллельно, а не подряд.
 */

export type HangingFetchHandle = {
  /** Подставляется вместо `fetch` (глобального или инжектируемого). */
  fetch: typeof fetch;
  /** Сколько запросов дошло до стенда — отличает «повисло» от «не позвали». */
  callCount: () => number;
  /** `init` последнего вызова — для проверок, где нужен сам сигнал. */
  lastInit: () => RequestInit | undefined;
  /** Снимает висящие промисы, чтобы не течь между тестами. */
  release: () => void;
};

export function createHangingFetch(): HangingFetchHandle {
  let calls = 0;
  let lastInit: RequestInit | undefined;
  const pending = new Set<(reason: unknown) => void>();

  const impl = (async (_input: unknown, init?: RequestInit) => {
    calls += 1;
    lastInit = init;
    const signal = init?.signal ?? undefined;

    return new Promise<Response>((_resolve, reject) => {
      pending.add(reject);

      // Без дедлайна промис не завершится НИКОГДА — это и есть проверяемое
      // условие, а не недосмотр стенда.
      if (!signal) return;

      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }) as unknown as typeof fetch;

  return {
    fetch: impl,
    callCount: () => calls,
    lastInit: () => lastInit,
    release: () => {
      for (const reject of pending) {
        reject(new Error("hanging-fetch released"));
      }
      pending.clear();
    },
  };
}

/**
 * Подменяет глобальный `fetch` на стенд и возвращает функцию восстановления.
 * Для сайтов, которые берут `fetch` из глобали (OAuth, alert), — в отличие от
 * SMSC, куда реализация инжектируется параметром.
 */
export function installHangingFetch(): HangingFetchHandle & { restore: () => void } {
  const real = globalThis.fetch;
  const handle = createHangingFetch();
  globalThis.fetch = handle.fetch;

  return {
    ...handle,
    restore: () => {
      handle.release();
      globalThis.fetch = real;
    },
  };
}
