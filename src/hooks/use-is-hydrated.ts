"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * MODAL-SSR-OPEN-HYDRATION — «мы на клиенте и гидрация уже прошла».
 *
 * `false` на сервере И на первом клиентском рендере (гидрации), `true` после.
 * Нужен всему, что рендерится через `createPortal(document.body)`: портала в
 * серверной разметке нет (`renderToString` его не поддерживает), поэтому первый
 * клиентский рендер обязан вернуть тот же `null`, иначе React печатает
 * «Hydration failed…» и пересобирает поддерево. Модульный
 * `typeof document !== "undefined"` этого не даёт — на клиенте он `true` уже
 * при гидрации; так `ModalSurface` с `open` из URL (`?manual=1` дашборда) шумел
 * ошибкой на каждом открытии, а следом React ругался на `<script>` из
 * пересобранного поддерева.
 *
 * `useSyncExternalStore` вместо `useState + useEffect`: без setState в эффекте
 * (правило `react-hooks/set-state-in-effect`) и без лишнего кадра при обычной
 * клиентской навигации — там `getSnapshot` отдаёт `true` сразу. Единственный
 * источник для всех портальных поверхностей; сторож —
 * `components/ui/portal-hydration-gate.test.ts`.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
