"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSerialTask } from "@/hooks/use-serial-task";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type AutosaveResult = { ok: true } | { ok: false; message?: string };

/**
 * RES-07 — save-callback не имеет права бросать наружу.
 *
 * Все четыре inline-edit поверхности профиля мастера зовут `fetch` без
 * `try/catch`, а `fetch` бросает при offline/обрыве DNS (в отличие от 4xx/5xx,
 * которые возвращают `response.ok === false`). Бросок улетал мимо ветки
 * `setStatus("error")`, то есть статус НАВСЕГДА оставался «сохраняется»: чип
 * крутится, правка не ушла, пользователь уверен, что всё сохранено. Это тихая
 * потеря введённого на одном сетевом дребезге.
 *
 * Нормализация стоит здесь, а не в каждом из четырёх вызывающих: они
 * отличаются только формой тела запроса, а решение «сбой сети = неуспешное
 * сохранение, а не подвисший статус» — общее, и пятая поверхность обязана
 * унаследовать его, а не переписать.
 */
export async function safeSave<T>(
  save: (value: T) => Promise<AutosaveResult>,
  value: T
): Promise<AutosaveResult> {
  try {
    return await save(value);
  } catch {
    // Сообщение не выдумываем: чип статуса печатает свою строку из `UI_TEXT`,
    // а `errorMessage` остаётся каналом для содержательного ответа сервера.
    return { ok: false };
  }
}

type UseAutosaveOptions<T> = {
  /** Compares baseline & next value to skip no-op saves. Default: strict equality. */
  isEqual?: (a: T, b: T) => boolean;
  /** Debounce window for input-triggered saves (ms). Default 700 — matches the
   * ui-ux-pro-max skill's main inline-edit pattern. Blur cancels the timer
   * and saves immediately. */
  debounceMs?: number;
  /** Auto-clear "saved" status after this many ms. Default 1800. */
  savedHoldMs?: number;
};

/**
 * Tiny autosave helper for the inline-edit primitives in 31a profile.
 *
 * The skill mandates: input → debounce 700ms → save · blur → save now ·
 * Enter → save now · Escape → cancel & revert. Status indicator cycles
 * idle → saving → saved (1.8s) → idle.
 *
 * Optimistic UI is the responsibility of the caller — this hook only
 * orchestrates the save lifecycle and surfaces a status. Caller passes
 * `save(value) → AutosaveResult`.
 */
export function useAutosave<T>(
  save: (value: T) => Promise<AutosaveResult>,
  options: UseAutosaveOptions<T> = {}
) {
  const { debounceMs = 700, savedHoldMs = 1800 } = options;
  // Memoise so the comparator doesn't churn `performSave`'s dep list on
  // every render — react-hooks/exhaustive-deps would flag it otherwise.
  const isEqual = useMemo(
    () => options.isEqual ?? ((a: T, b: T) => Object.is(a, b)),
    [options.isEqual]
  );

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<T | null>(null);

  const clearDebounce = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const clearSavedHold = () => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  };

  // LOGIC-23: `inFlightRef` здесь присваивался, но нигде не читался как гейт —
  // то есть параллельные `performSave` ничем не сдерживались, и порядок
  // применения результатов определялся порядком ОТВЕТОВ, а не правок.
  // Сериализация через общую «очередь на одного»; `lastSavedRef` при этом
  // сверяется внутри прогона, уже после ожидания, — иначе вытесненное
  // значение сравнивалось бы с устаревшей отметкой.
  const performSave = useSerialTask<T>(
    useCallback(
      async (value: T) => {
        if (lastSavedRef.current !== null && isEqual(value, lastSavedRef.current)) {
          return;
        }
        setStatus("saving");
        setErrorMessage(null);
        const result = await safeSave(save, value);
        if (result.ok) {
          lastSavedRef.current = value;
          setStatus("saved");
          clearSavedHold();
          savedTimerRef.current = setTimeout(() => {
            setStatus("idle");
          }, savedHoldMs);
        } else {
          setErrorMessage(result.message ?? null);
          setStatus("error");
        }
      },
      [isEqual, save, savedHoldMs]
    )
  );

  const scheduleSave = useCallback(
    (value: T) => {
      clearDebounce();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave(value);
      }, debounceMs);
    },
    [debounceMs, performSave]
  );

  const flush = useCallback(
    async (value: T) => {
      clearDebounce();
      await performSave(value);
    },
    [performSave]
  );

  const cancel = useCallback(() => {
    clearDebounce();
    setStatus((prev) => (prev === "saving" ? prev : "idle"));
    setErrorMessage(null);
  }, []);

  const setBaseline = useCallback((value: T) => {
    lastSavedRef.current = value;
  }, []);

  return {
    status,
    errorMessage,
    scheduleSave,
    flush,
    cancel,
    setBaseline,
  };
}
