"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * LOGIC-23 — «очередь на одного»: пока задача в полёте, новый запрос её НЕ
 * дублирует, а замещает отложенный вход. По завершении текущей выполняется
 * последний отложенный — ровно один раз, сколькими бы запросами он ни был
 * набран.
 *
 * Зачем это отдельным примитивом. Три автосейв-хука проекта расходились в
 * том, чего у них нет: клиентский профиль не имел guard'а вовсе (два `PATCH`
 * с РАЗНЫМИ частичными патчами летели одновременно, и выигрывал последний
 * ответ, а не последняя правка); расписание заводило `AbortController`, но
 * `signal` в `fetch` не передавало — то есть отменяло применение устаревшего
 * ответа, а не сам запрос, и оба PATCH'а доезжали до сервера (для расписания
 * это прямой путь к дубликатам `ScheduleOverride` и `P2002`); мастерский
 * профиль присваивал `inFlightRef`, но нигде его не читал.
 *
 * Почему «замещает», а не «ставит в очередь все»: промежуточные состояния
 * черновика ценности не имеют — сохранить нужно последнее. Очередь из всех
 * запросов дала бы серию бессмысленных PATCH'ей и тот же порядок гонки, но
 * растянутый во времени.
 *
 * Возвращённый промис ждущего запроса резолвится, когда его значение
 * обработано — своим прогоном либо тем, который его вытеснил (вытеснивший
 * несёт более свежее значение, то есть обязательство «сохранено» выполнено
 * строго сильнее). На это опирается `flush`, который вызывающие ждут.
 */
export function useSerialTask<T>(run: (value: T) => Promise<void>): (value: T) => Promise<void> {
  const runRef = useRef(run);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef<{
    value: T;
    settle: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  } | null>(null);

  useEffect(() => {
    runRef.current = run;
  });

  const drain = useCallback(async () => {
    try {
      while (queuedRef.current) {
        const pending = queuedRef.current;
        queuedRef.current = null;
        try {
          await runRef.current(pending.value);
          for (const item of pending.settle) item.resolve();
        } catch (error) {
          // Ошибка одного прогона не должна заклинить очередь: отложенное
          // значение свежее и обязано получить свой шанс.
          for (const item of pending.settle) item.reject(error);
        }
      }
    } finally {
      // Снятие флага и выход из цикла — в одном синхронном шаге, иначе между
      // ними появилось бы окно, в котором запрос видит «занято», а
      // разбирать его уже некому.
      inFlightRef.current = null;
    }
  }, []);

  return useCallback(
    (value: T) => {
      const promise = new Promise<void>((resolve, reject) => {
        const queued = queuedRef.current;
        if (queued) {
          queued.value = value;
          queued.settle.push({ resolve, reject });
          return;
        }
        queuedRef.current = { value, settle: [{ resolve, reject }] };
      });

      if (!inFlightRef.current) {
        inFlightRef.current = drain();
      }

      return promise;
    },
    [drain]
  );
}
