"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { isProduction } from "@/lib/env.client";

/**
 * PWA-RELOAD-01 — страница перезагружается при смене сервис-воркера ТОЛЬКО по
 * нажатию «Обновить».
 *
 * `src/app/sw.ts` стоит на `skipWaiting` + `clientsClaim`, поэтому
 * `controllerchange` приходит без участия пользователя дважды: при ПЕРВОМ
 * открытии приложения (контроллер null → свежий SW, это не обновление вовсе)
 * и на каждом деплое (новый SW захватывает уже открытые вкладки). Безусловный
 * reload в обработчике перезагружал страницу через секунду после первого
 * открытия и посреди заполнения формы после выкатки. Старая вкладка под новым
 * SW работоспособна: навигации идут в сеть (`NetworkOnly`), а рассинхрон
 * версии Next сам разрешает жёсткой навигацией на следующем переходе.
 *
 * PWA-UPDATE-BUTTON-01 — «Обновить» не делала ничего. Из-за того же
 * `skipWaiting` новый SW не ждёт: плашка показывается в `installed`, а через
 * миллисекунды он уже `activating`, и `controllerchange` проходит ДО клика
 * (замер в Chromium: плашка 531 мс → `controllerchange` 533 мс). Кнопка же
 * слала `SKIP_WAITING` и ждала `controllerchange`, которого больше не будет,
 * а при `skipWaiting: true` serwist этот message даже не слушает. Теперь:
 * воркер, который действительно ждёт (`installed`), просим активироваться и
 * перезагружаемся по `controllerchange`; уже активный — перезагружаем сразу.
 */

/** Страховка: если `controllerchange` после `SKIP_WAITING` так и не пришёл. */
const RELOAD_FALLBACK_MS = 3000;

export function PWAUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    if (!isProduction) return;
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    const handleRegistration = (reg: ServiceWorkerRegistration | undefined) => {
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
        setVisible(true);
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(installing);
            setVisible(true);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistration().then(handleRegistration).catch(() => null);

    const handleControllerChange = () => {
      if (!mounted || !reloadRequestedRef.current) return;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!isProduction || !visible) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-prompt pt-[var(--safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card">
        <div className="text-sm text-text-main">{UI_TEXT.pwa.update.title}</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setVisible(false)}
          >
            {UI_TEXT.actions.later}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (waitingWorker?.state === "installed") {
                // Перезагрузка — в `controllerchange`, когда новый SW
                // действительно взял страницу, иначе она ушла бы под старым.
                reloadRequestedRef.current = true;
                waitingWorker.postMessage({ type: "SKIP_WAITING" });
                window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
                return;
              }
              // Новый SW уже активен и страницу взял (skipWaiting + clientsClaim):
              // ждать нечего, осталось подгрузить свежий HTML и чанки.
              window.location.reload();
            }}
          >
            {UI_TEXT.pwa.update.update}
          </Button>
        </div>
      </div>
    </div>
  );
}
