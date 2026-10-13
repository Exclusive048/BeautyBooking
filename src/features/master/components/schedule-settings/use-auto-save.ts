"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSerialTask } from "@/hooks/use-serial-task";
import { serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { SaveStatus } from "./save-status-provider";

type SaveResult = { ok: true } | { ok: false; message: string };

type Options<T> = {
  /** Current draft value. The hook serialises it (JSON) to detect change. */
  value: T;
  /** Initial baseline — when value matches baseline, no save is fired. */
  baseline: T;
  /** Debounce in ms. Default 500. */
  debounceMs?: number;
  /** Async writer. Should return ok=false on validation/server error. */
  save: (value: T) => Promise<SaveResult>;
  /** Setter for the shared status chip. */
  setStatus: (next: SaveStatus) => void;
  /** Setter for the error message displayed alongside status. */
  setErrorMessage: (next: string | null) => void;
  /**
   * Called after a successful save so the parent can advance baseline.
   * Только пока компонент смонтирован: это его локальное состояние.
   */
  onSaved?: (value: T) => void;
};

/**
 * Debounced auto-save. Compares the draft against the supplied baseline
 * via JSON.stringify; if they differ, a timer is set and `save` is called
 * `debounceMs` later. Status transitions: idle → saving → saved (resets to
 * idle after 1.8s) or error. The "saved" → "idle" reset gives the chip
 * time to flash before fading.
 *
 * UX-PASS-01: правка, чей таймер ещё не сработал, при размонтировании
 * (переключение вкладки, пересоздание вкладок после окна графика) не теряется,
 * а отправляется сразу. Чип статуса живёт в провайдере страницы и переживает
 * вкладку, поэтому сохранение, завершившееся после ухода с неё, доводит его до
 * «сохранено» / «ошибка» — иначе он навсегда остался бы «сохраняется».
 * Локальное состояние (`onSaved`, сброс чипа в «пусто») трогаем только у
 * смонтированного компонента.
 */
export function useAutoSave<T>(opts: Options<T>): void {
  const { value, baseline, debounceMs = 500, save, setStatus, setErrorMessage, onSaved } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // UX-PASS-01: черновик, ждущий своего таймера, — его дожимает размонтирование.
  const pendingRef = useRef<{ value: T; serialised: string } | null>(null);
  const mountedRef = useRef(true);
  const lastSavedRef = useRef<string>(JSON.stringify(baseline));
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = onSaved;
  });

  // LOGIC-23: раньше здесь жил `AbortController`, чей `signal` в `fetch` не
  // передавался — он гасил только ПРИМЕНЕНИЕ устаревшего ответа, а оба PATCH'а
  // всё равно доезжали до сервера. Для расписания это прямой путь к
  // дубликатам `ScheduleOverride` и `P2002` на `@@unique([configId, weekday])`.
  // Теперь запросы не пересекаются вовсе: пока один в полёте, следующий ждёт
  // и стартует с самым свежим черновиком.
  const requestSave = useSerialTask<{ value: T; serialised: string }>(
    useCallback(
      async ({ value: draft, serialised }) => {
        try {
          const result = await saveRef.current(draft);
          if (result.ok) {
            lastSavedRef.current = serialised;
            setStatus("saved");
            if (!mountedRef.current) return;
            onSavedRef.current?.(draft);
            idleTimerRef.current = setTimeout(() => setStatus("idle"), 1800);
          } else {
            setStatus("error");
            setErrorMessage(result.message);
          }
        } catch (error) {
          setStatus("error");
          setErrorMessage(serverMessageOr(error, UI_TEXT.cabinetMaster.scheduleSettings.errors.save));
        }
      },
      [setStatus, setErrorMessage]
    )
  );

  useEffect(() => {
    const serialised = JSON.stringify(value);
    if (serialised === lastSavedRef.current) {
      // Правку вернули к сохранённому — дожимать нечего.
      pendingRef.current = null;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    pendingRef.current = { value, serialised };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      setStatus("saving");
      void requestSave({ value, serialised });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, setStatus, requestSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      // UX-PASS-01: таймер снят вместе с компонентом — правку отправляем сразу,
      // а не теряем (раньше уход с вкладки в окне 500 мс её выбрасывал).
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        setStatus("saving");
        void requestSave(pending);
      }
    };
  }, [setStatus, requestSave]);
}
