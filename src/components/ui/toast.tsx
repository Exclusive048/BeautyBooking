"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, m } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  createToastStore,
  type ToastItem,
  type ToastStore,
  type ToastTone,
} from "@/components/ui/toast-store";
import { MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * Короткие сообщения — единственная система на весь продукт (29.09 доработки
 * · 10, RES-18). Заменила `window.alert` (блокировал страницу) и одиннадцать
 * самодельных копий на `useState` + `setTimeout` (2,4 с, в потоке страницы,
 * ошибки как `role="status"`).
 *
 * Когда тост, а когда сообщение в форме: итог действия, после которого экран
 * меняется или закрывается, — тост; ошибка поля и отказ отправки формы — в
 * форме рядом с кнопкой (внутри окна фокус заперт, крестик тоста с клавиатуры
 * недоступен).
 *
 * Текст — только строка (`UI_TEXT` или курируемое сообщение сервера), JSX не
 * принимается.
 */

type ToastApi = {
  success: (text: string) => number;
  error: (text: string) => number;
  info: (text: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastStore | null>(null);

const EMPTY: readonly ToastItem[] = [];
const getServerSnapshot = () => EMPTY;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createToastStore());
  return (
    <ToastContext.Provider value={store}>
      {children}
      <ToastViewport store={store} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const store = useContext(ToastContext);
  if (!store) {
    // Провайдер стоит в корневом layout: сюда попадает только компонент,
    // вынесенный из дерева приложения, — это ошибка подключения, а не отказ,
    // который можно молча проглотить.
    throw new Error("useToast() вызван вне <ToastProvider>");
  }
  return useMemo(
    () => ({
      success: (text: string) => store.add("success", text),
      error: (text: string) => store.add("error", text),
      info: (text: string) => store.add("info", text),
      dismiss: (id: number) => store.dismiss(id),
    }),
    [store],
  );
}

function ToastViewport({ store }: { store: ToastStore }) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return (
    <ToastList
      items={items}
      onDismiss={store.dismiss}
      onPause={store.pause}
      onResume={store.resume}
    />
  );
}

const TONE_ICON: Record<ToastTone, { Icon: typeof Info; className: string }> = {
  success: { Icon: CheckCircle2, className: "text-success-text" },
  error: { Icon: AlertCircle, className: "text-danger-text" },
  info: { Icon: Info, className: "text-info-text" },
};

/**
 * Разметка отдельно от подписки — её рендерит тест без DOM. Две живые области
 * существуют всегда, даже пустые: область, появившаяся вместе с первым
 * сообщением, экранным диктором не озвучивается. Ошибка — `role="alert"`
 * (сразу), успех и сведения — `role="status"` (вежливо).
 */
export function ToastList({
  items,
  onDismiss,
  onPause,
  onResume,
}: {
  items: readonly ToastItem[];
  onDismiss: (id: number) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const polite = items.filter((item) => item.tone !== "error");
  const assertive = items.filter((item) => item.tone === "error");

  // Сообщение, под курсором или в фокусе, может исчезнуть (закрыли, вытеснено
  // четвёртым): `mouseleave`/`blur` у удалённого узла не приходят, и пауза
  // залипла бы для остальных. Поэтому держим, КТО держит паузу, и отпускаем её,
  // когда его не стало.
  const holderRef = useRef<number | null>(null);
  useEffect(() => {
    const holder = holderRef.current;
    if (holder !== null && !items.some((item) => item.id === holder)) {
      holderRef.current = null;
      onResume();
    }
  }, [items, onResume]);

  const hold = (id: number) => {
    holderRef.current = id;
    onPause();
  };
  const release = () => {
    holderRef.current = null;
    onResume();
  };
  const handleBlur = (event: FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) release();
  };

  const renderItem = (item: ToastItem) => {
    const { Icon, className } = TONE_ICON[item.tone];
    // Соседи встают на место за счёт высоты самого сообщения: оно раскрывается
    // от 0 и схлопывается в 0 (29.09 доработки · 19). Раньше это делал
    // `layout="position"`, но layout-проекция не входит в `domAnimation`, а тосты
    // стоят в шелле каждой страницы. Отступ между сообщениями — внутри элемента
    // (`pb-2`), иначе `gap` щёлкал бы на 8px в момент удаления узла.
    return (
      <m.li
        key={item.id}
        initial={{ opacity: 0, height: 0, overflow: "hidden" }}
        animate={{ opacity: 1, height: "auto", transitionEnd: { overflow: "visible" } }}
        exit={{ opacity: 0, height: 0, overflow: "hidden", transition: MOTION.exit }}
        transition={MOTION.base}
        data-testid="toast-item"
        data-tone={item.tone}
        onMouseEnter={() => hold(item.id)}
        onMouseLeave={release}
        onFocus={() => hold(item.id)}
        onBlur={handleBlur}
        className="pointer-events-auto"
      >
        <div className="pb-2">
          <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-card py-3 pl-4 pr-2 text-sm text-text-main shadow-hover">
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} strokeWidth={1.5} aria-hidden />
            <p className="min-w-0 flex-1 self-center break-words">{item.text}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={UI_TEXT.common.close}
              onClick={() => onDismiss(item.id)}
              className="-my-2 shrink-0 text-text-sec"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </Button>
          </div>
        </div>
      </m.li>
    );
  };

  return (
    <div
      data-testid="toast-region"
      // Нижний отступ на 8px меньше прежнего: его добирает `pb-2` последнего сообщения.
      className="pointer-events-none fixed inset-x-4 bottom-[calc(max(var(--bottom-nav-h,0px),env(safe-area-inset-bottom,0px))+4px)] z-toast mx-auto flex max-w-md flex-col lg:inset-x-auto lg:bottom-4 lg:right-6 lg:mx-0 lg:w-[360px]"
    >
      <div role="status" aria-live="polite">
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>{polite.map(renderItem)}</AnimatePresence>
        </ul>
      </div>
      <div role="alert" aria-live="assertive">
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>{assertive.map(renderItem)}</AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
