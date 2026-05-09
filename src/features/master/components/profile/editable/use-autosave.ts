"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type AutosaveResult = { ok: true } | { ok: false; message?: string };

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
  const inFlightRef = useRef<Promise<void> | null>(null);
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

  const performSave = useCallback(
    async (value: T) => {
      if (lastSavedRef.current !== null && isEqual(value, lastSavedRef.current)) {
        return;
      }
      setStatus("saving");
      setErrorMessage(null);
      const promise = (async () => {
        const result = await save(value);
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
      })();
      inFlightRef.current = promise;
      try {
        await promise;
      } finally {
        if (inFlightRef.current === promise) {
          inFlightRef.current = null;
        }
      }
    },
    [isEqual, save, savedHoldMs]
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
