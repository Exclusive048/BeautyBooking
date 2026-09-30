import { describe, expect, it } from "vitest";
import {
  TOAST_DEDUP_WINDOW_MS,
  TOAST_DURATION_MS,
  TOAST_MAX_VISIBLE,
  createToastStore,
  type ToastTimers,
} from "@/components/ui/toast-store";

/**
 * 29.09 доработки · 10 — поведение ядра тостов на управляемых часах.
 *
 * @probe 2026-09-29 — в `pause()` убрана остановка таймеров (`stopTimer`):
 * покраснел «пауза останавливает таймер, продолжение — с остатка». Возвращено — зелёный.
 */

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: ToastTimers = {
    setTimeout: (callback, ms) => {
      seq += 1;
      pending.set(seq, { at: now + ms, callback });
      return seq;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { timers, advance };
}

describe("toast-store", () => {
  it("скрывается сам: успех — через 4 с, ошибка — через 7 с", () => {
    const { timers, advance } = fakeTimers();
    const store = createToastStore(timers);
    store.add("success", "Сохранено.");
    store.add("error", "Не удалось сохранить. Попробуйте ещё раз.");
    advance(TOAST_DURATION_MS.success - 1);
    expect(store.getSnapshot()).toHaveLength(2);
    advance(1);
    expect(store.getSnapshot().map((t) => t.tone)).toEqual(["error"]);
    advance(TOAST_DURATION_MS.error - TOAST_DURATION_MS.success);
    expect(store.getSnapshot()).toEqual([]);
  });

  it("пауза останавливает таймер, продолжение — с остатка", () => {
    const { timers, advance } = fakeTimers();
    const store = createToastStore(timers);
    store.add("info", "Сессий больше нет.");
    advance(3000);
    store.pause();
    advance(60_000);
    expect(store.getSnapshot()).toHaveLength(1);
    store.resume();
    advance(999);
    expect(store.getSnapshot()).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot()).toEqual([]);
  });

  it("новое сообщение во время паузы ждёт её конца", () => {
    const { timers, advance } = fakeTimers();
    const store = createToastStore(timers);
    store.pause();
    store.add("success", "Готово.");
    advance(10_000);
    expect(store.getSnapshot()).toHaveLength(1);
    store.resume();
    advance(TOAST_DURATION_MS.success);
    expect(store.getSnapshot()).toEqual([]);
  });

  it(`видно не больше ${TOAST_MAX_VISIBLE}: старейшее уходит`, () => {
    const { timers } = fakeTimers();
    const store = createToastStore(timers);
    for (const text of ["1", "2", "3", "4"]) store.add("info", text);
    expect(store.getSnapshot().map((t) => t.text)).toEqual(["2", "3", "4"]);
  });

  it("тот же текст того же тона в пределах секунды — одно сообщение", () => {
    const { timers, advance } = fakeTimers();
    const store = createToastStore(timers);
    const first = store.add("error", "Не удалось удалить.");
    advance(TOAST_DEDUP_WINDOW_MS - 1);
    expect(store.add("error", "Не удалось удалить.")).toBe(first);
    expect(store.add("info", "Не удалось удалить.")).not.toBe(first);
    expect(store.getSnapshot()).toHaveLength(2);
    advance(1);
    store.add("error", "Не удалось удалить.");
    expect(store.getSnapshot()).toHaveLength(3);
  });

  it("dismiss убирает сразу и снимает таймер; подписчики узнают об изменениях", () => {
    const { timers, advance } = fakeTimers();
    const store = createToastStore(timers);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const id = store.add("success", "Готово.");
    store.dismiss(id);
    expect(store.getSnapshot()).toEqual([]);
    advance(TOAST_DURATION_MS.success);
    expect(calls).toBe(2);
    unsubscribe();
    store.add("success", "Ещё.");
    expect(calls).toBe(2);
  });
});
