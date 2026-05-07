"use client";

import { useEffect, useRef } from "react";
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
  const inFlightRef = useRef<AbortController | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(baseline));
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = onSaved;
  });

  useEffect(() => {
    const serialised = JSON.stringify(value);
    if (serialised === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      inFlightRef.current?.abort();
      inFlightRef.current = controller;

      setStatus("saving");
      saveRef.current(value)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.ok) {
            lastSavedRef.current = serialised;
            setStatus("saved");
            onSavedRef.current?.(value);
            idleTimerRef.current = setTimeout(() => setStatus("idle"), 1800);
          } else {
            setStatus("error");
            setErrorMessage(result.message);
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
        });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, setStatus, setErrorMessage]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      inFlightRef.current?.abort();
    };
  }, []);
}
