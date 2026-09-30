/**
 * Ядро коротких сообщений (тостов) — без React (29.09 доработки · 10, RES-18).
 *
 * Очередь, авто-скрытие по тону, пауза, лимит видимых и защита от двойного
 * клика. Разметка и подписка — `toast.tsx`; здесь только поведение, чтобы его
 * можно было проверить на фейковых таймерах без DOM.
 *
 * Константы — решение владельца 2026-09-29 (вопрос 10.1): до трёх сразу,
 * успех и сведения — 4 с, ошибка — 7 с (фраза из десяти слов за 2,4 с прежних
 * самодельных копий не читалась), пауза при наведении и фокусе (WCAG 2.2.1).
 */

export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  readonly id: number;
  readonly tone: ToastTone;
  readonly text: string;
};

export const TOAST_DURATION_MS: Readonly<Record<ToastTone, number>> = {
  success: 4000,
  info: 4000,
  error: 7000,
};

/** Больше — старейший уходит: стопка выше трёх закрывает контент телефона. */
export const TOAST_MAX_VISIBLE = 3;

/** Тот же текст того же тона в пределах окна — двойной клик, а не новое событие. */
export const TOAST_DEDUP_WINDOW_MS = 1000;

export type ToastTimers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
};

const defaultTimers: ToastTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export type ToastStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly ToastItem[];
  add: (tone: ToastTone, text: string) => number;
  dismiss: (id: number) => void;
  /** Остановить таймеры всех видимых (наведение или фокус на сообщении). */
  pause: () => void;
  /** Продолжить с оставшегося времени, а не с начала. */
  resume: () => void;
};

type Timing = { remaining: number; startedAt: number; handle: unknown };

export function createToastStore(timers: ToastTimers = defaultTimers): ToastStore {
  let items: readonly ToastItem[] = [];
  let nextId = 1;
  let paused = false;
  const listeners = new Set<() => void>();
  const timing = new Map<number, Timing>();
  const recent = new Map<string, { id: number; at: number }>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const startTimer = (id: number) => {
    const entry = timing.get(id);
    if (!entry || entry.handle !== null) return;
    entry.startedAt = timers.now();
    entry.handle = timers.setTimeout(() => dismiss(id), entry.remaining);
  };

  const stopTimer = (id: number) => {
    const entry = timing.get(id);
    if (!entry || entry.handle === null) return;
    timers.clearTimeout(entry.handle);
    entry.remaining = Math.max(0, entry.remaining - (timers.now() - entry.startedAt));
    entry.handle = null;
  };

  function dismiss(id: number): void {
    if (!items.some((item) => item.id === id)) return;
    const entry = timing.get(id);
    if (entry && entry.handle !== null) timers.clearTimeout(entry.handle);
    timing.delete(id);
    items = items.filter((item) => item.id !== id);
    emit();
  }

  function add(tone: ToastTone, text: string): number {
    const key = `${tone}\u0000${text}`;
    const now = timers.now();
    const previous = recent.get(key);
    if (previous && now - previous.at < TOAST_DEDUP_WINDOW_MS && items.some((item) => item.id === previous.id)) {
      return previous.id;
    }

    const id = nextId++;
    recent.set(key, { id, at: now });
    items = [...items, { id, tone, text }];
    timing.set(id, { remaining: TOAST_DURATION_MS[tone], startedAt: now, handle: null });
    if (!paused) startTimer(id);

    while (items.length > TOAST_MAX_VISIBLE) {
      const oldest = items[0];
      const entry = timing.get(oldest.id);
      if (entry && entry.handle !== null) timers.clearTimeout(entry.handle);
      timing.delete(oldest.id);
      items = items.slice(1);
    }
    emit();
    return id;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => items,
    add,
    dismiss,
    pause() {
      if (paused) return;
      paused = true;
      for (const item of items) stopTimer(item.id);
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const item of items) startTimer(item.id);
    },
  };
}
