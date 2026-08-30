import { describe, expect, it } from "vitest";
import { reconcileDraft, type DraftState } from "@/hooks/use-deferred-commit";

/**
 * CATALOG-FILTER-DEBOUNCE — чистая часть `useDeferredCommit`: кто старше,
 * черновик пользователя или новое внешнее значение.
 *
 * Сценарии взяты с ползунка цены каталога, где значение живёт в URL и
 * догоняет черновик с задержкой навигации.
 */

const eq = (a: number, b: number) => a === b;
const pair = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

const draft = <T,>(over: Partial<DraftState<T>> & Pick<DraftState<T>, "draft" | "base">): DraftState<T> => ({
  lastSent: null,
  pending: true,
  ...over,
});

describe("reconcileDraft", () => {
  it("без черновика — нечего сводить", () => {
    expect(reconcileDraft(null, 5, eq)).toBeNull();
  });

  it("снаружи ничего не двигалось → тот же объект (guarded setState не зацикливается)", () => {
    const s = draft({ draft: 7, base: 5 });
    expect(reconcileDraft(s, 5, eq)).toBe(s);
  });

  it("наш коммит доехал и редактирование закончилось → черновик отпущен", () => {
    const s = draft({ draft: 7, base: 5, lastSent: 7, pending: false });
    expect(reconcileDraft(s, 7, eq)).toBeNull();
  });

  it("наш коммит доехал, пока пользователь продолжал тянуть → перебазировать, а не сбросить", () => {
    // Отправили 7, пользователь уже на 9, URL только что стал 7.
    const s = draft({ draft: 9, base: 5, lastSent: 7, pending: true });
    const next = reconcileDraft(s, 7, eq);
    expect(next).not.toBeNull();
    expect(next!.draft).toBe(9); // последнее движение не потеряно
    expect(next!.base).toBe(7);
    expect(next!.pending).toBe(true);
  });

  it("внешнее изменение (сброс фильтров) старше черновика → черновик сброшен", () => {
    const s = draft({ draft: 9, base: 5, lastSent: 7, pending: true });
    expect(reconcileDraft(s, 0, eq)).toBeNull();
  });

  it("внешнее изменение до первой отправки (lastSent = null) тоже побеждает", () => {
    const s = draft({ draft: 9, base: 5 });
    expect(reconcileDraft(s, 3, eq)).toBeNull();
  });

  it("работает с пользовательским равенством (пара цен)", () => {
    const s = draft<[number, number]>({ draft: [100, 900], base: [0, 1000], lastSent: [100, 900], pending: false });
    // Тот же диапазон, но новая ссылка — это «доехало», а не «внешнее».
    expect(reconcileDraft(s, [100, 900], pair)).toBeNull();
    // Диапазон не менялся — черновик живёт.
    expect(reconcileDraft(s, [0, 1000], pair)).toBe(s);
  });
});
