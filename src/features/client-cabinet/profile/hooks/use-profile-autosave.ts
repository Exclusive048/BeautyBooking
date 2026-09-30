"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSerialTask } from "@/hooks/use-serial-task";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type { ProfileDTO, ProfileUpdatePatch } from "@/lib/client-cabinet/profile.service";
import * as UI_TEXT from "@/lib/ui/text";

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
  /**
   * FIX-C8 — текст отказа рядом со статусом.
   *
   * Индикатор знал только «Не удалось сохранить. Попробуйте ещё раз.», а самый
   * вероятный отказ этого PATCH'а — `ALREADY_EXISTS` 409 на занятый email или
   * телефон, то есть повтор не поможет НИКОГДА (вторая половина инв. #41:
   * «заявить» адрес может кто угодно, «владеть» — один). Пользователь правил
   * поле, видел красную точку без объяснения и не мог узнать, что адрес занят.
   */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      const profile = await fetchJson<ProfileDTO>("/api/cabinet/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSaved(profile);
      setErrorMessage(null);
      setStatus("saved");
      if (fadeRef.current) clearTimeout(fadeRef.current);
      fadeRef.current = setTimeout(() => setStatus("idle"), SAVED_FADE_MS);
    } catch (caught) {
      // fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ: «Этот email уже используется другим
      // аккаунтом. Укажите другой адрес.» называет и причину, и действие,
      // тогда как канон индикатора («Попробуйте ещё раз») на 409 — неверный
      // совет. Своя строка остаётся дефолтом для обрыва сети и 5xx.
      setErrorMessage(serverMessageOr(caught, UI_TEXT.clientCabinet.profilePage.saveStatus.error));
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

  return { status, errorMessage, scheduleSave };
}
