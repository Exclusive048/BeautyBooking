"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSerialTask } from "@/hooks/use-serial-task";
import type { ProfileDTO, ProfileUpdatePatch } from "@/lib/client-cabinet/profile.service";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 700;
const SAVED_FADE_MS = 1800;
const ERROR_FADE_MS = 3000;

type Options = {
  /** Called with the server's fresh profile DTO after a successful save. */
  onSaved: (profile: ProfileDTO) => void;
};

/**
 * Debounced profile autosave. Field changes call `scheduleSave(patch)` —
 * multiple patches inside the debounce window merge into one PATCH so
 * we don't fire a request for every keystroke. After a successful save
 * we hand the fresh DTO back so the page can reconcile (e.g. completion
 * percent recalculates server-side).
 *
 * On failure we surface `error` for ~3s, then fade to idle. Rapid retries
 * after a failure naturally re-attempt — the pending patch is preserved
 * across rejections so partial work isn't lost.
 */
export function useProfileAutosave({ onSaved }: Options) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pendingRef = useRef<Partial<ProfileUpdatePatch>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LOGIC-23: guard'а не было вовсе — `flush` забирает накопленный патч и
  // обнуляет `pendingRef`, поэтому повторный debounce до возврата первого
  // ответа отправлял ВТОРОЙ PATCH с ДРУГИМ набором полей параллельно, и
  // выигрывал последний пришедший ответ, а не последняя правка. «Очередь на
  // одного» это закрывает без потери правок: пока запрос в полёте,
  // накопление продолжается в `pendingRef`, и следующий прогон заберёт его
  // целиком.
  const flush = useSerialTask<void>(useCallback(async () => {
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(payload).length === 0) {
      setStatus("idle");
      return;
    }
    try {
      const res = await fetch("/api/cabinet/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setStatus("error");
        if (fadeRef.current) clearTimeout(fadeRef.current);
        fadeRef.current = setTimeout(() => setStatus("idle"), ERROR_FADE_MS);
        return;
      }
      onSaved(json.data as ProfileDTO);
      setStatus("saved");
      if (fadeRef.current) clearTimeout(fadeRef.current);
      fadeRef.current = setTimeout(() => setStatus("idle"), SAVED_FADE_MS);
    } catch {
      setStatus("error");
      if (fadeRef.current) clearTimeout(fadeRef.current);
      fadeRef.current = setTimeout(() => setStatus("idle"), ERROR_FADE_MS);
    }
  }, [onSaved]));

  const scheduleSave = useCallback(
    (patch: Partial<ProfileUpdatePatch>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      setStatus("saving");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush(undefined);
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    },
    [],
  );

  return { status, scheduleSave };
}
