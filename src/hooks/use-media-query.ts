"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Совпадает ли медиазапрос — через `useSyncExternalStore`, без setState в
 * эффекте. На сервере и при гидратации возвращает `serverValue`, затем —
 * фактическое значение, и дальше следит за изменением ширины окна.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}
