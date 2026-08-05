"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSerialTask } from "@/hooks/use-serial-task";
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
  /** Called after a successful save so the parent can advance baseline. */
  onSaved?: (value: T) => void;
};

/**
 * Debounced auto-save. Compares the draft against the supplied baseline
 * via JSON.stringify; if they differ, a timer is set and `save` is called
 * `debounceMs` later. Status transitions: idle → saving → saved (resets to
 * idle after 1.8s) or error. The "saved" → "idle" reset gives the chip
 * time to flash before fading.
 */
export function useAutoSave<T>(opts: Options<T>): void {
  const { value, baseline, debounceMs = 500, save, setStatus, setErrorMessage, onSaved } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          if (!mountedRef.current) return;
          if (result.ok) {
            lastSavedRef.current = serialised;
            setStatus("saved");
            onSavedRef.current?.(draft);
            idleTimerRef.current = setTimeout(() => setStatus("idle"), 1800);
          } else {
            setStatus("error");
            setErrorMessage(result.message);
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
        }
      },
      [setStatus, setErrorMessage]
    )
  );

  useEffect(() => {
    const serialised = JSON.stringify(value);
    if (serialised === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    timerRef.current = setTimeout(() => {
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
    };
  }, []);
}
