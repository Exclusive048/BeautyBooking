import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * CATALOG-FILTER-DEBOUNCE (2026-08-31) — «черновик показываем сразу, наружу
 * отдаём с задержкой».
 *
 * Зачем. Фильтры каталога живут в URL: каждое изменение — `router.replace`, и
 * уже от нового URL считается запрос `/api/catalog/search`. У непрерывных
 * контролов (ползунки цены и рейтинга — `<input type="range">`) событие
 * `change` летит на КАЖДЫЙ пиксель перетаскивания, то есть одно движение
 * мыши давало десятки навигаций и десятки запросов подряд. Дебаунс нельзя
 * поставить на сам запрос: ползунок рисуется от значения из URL, и без
 * локального черновика он бы «залипал» до конца задержки.
 *
 * Контракт:
 *   • `value` — черновик, если пользователь редактирует, иначе `committed`;
 *   • `setValue(next)` — обновляет черновик мгновенно и (пере)запускает таймер;
 *     по истечении `delayMs` тишины вызывается `commit(последний черновик)`;
 *   • когда `committed` ДОГНАЛ отправленное значение — черновик отпускается
 *     (дальше показывается `committed`); если пользователь продолжал
 *     редактировать, пока коммит «ехал», черновик перебазируется и ждёт свой
 *     таймер — последнее движение не теряется;
 *   • любое ДРУГОЕ изменение `committed` (сброс фильтров, навигация назад)
 *     считается внешним и побеждает: черновик сбрасывается, отложенный коммит
 *     отменяется.
 *
 * Чистая часть решения — `reconcileDraft` (пиннится `use-deferred-commit.test.ts`):
 * именно она отвечает на вопрос «чей черновик старше — наш или внешний».
 */

export type DraftState<T> = {
  /** Что показываем и что отправим по таймеру. */
  draft: T;
  /** `committed` в момент, когда черновик был взят/перебазирован. */
  base: T;
  /** Последнее значение, ушедшее в `commit` (null — ещё ничего не уходило). */
  lastSent: T | null;
  /** true — таймер ещё не выстрелил (пользователь редактирует). */
  pending: boolean;
};

export type IsEqual<T> = (a: T, b: T) => boolean;

/**
 * Свести черновик с новым `committed`. Вызывается на каждом рендере.
 * Возвращает тот же объект, если ничего не изменилось (важно для
 * guarded-setState во время рендера: иначе цикл).
 */
export function reconcileDraft<T>(
  state: DraftState<T> | null,
  committed: T,
  isEqual: IsEqual<T>,
): DraftState<T> | null {
  if (state === null) return null;
  // Снаружи ничего не двигалось — черновик живёт.
  if (isEqual(committed, state.base)) return state;
  // Наш собственный коммит доехал.
  if (state.lastSent !== null && isEqual(committed, state.lastSent)) {
    // Пользователь продолжал редактировать — перебазируем, таймер отправит остальное.
    if (state.pending) return { ...state, base: committed };
    // Редактирование закончилось, значение на месте — черновик больше не нужен.
    return null;
  }
  // Внешнее изменение (сброс, back-навигация) — оно старше нашего черновика.
  return null;
}

const objectIs: IsEqual<unknown> = Object.is;

export function useDeferredCommit<T>(
  committed: T,
  commit: (value: T) => void,
  delayMs: number,
  isEqual: IsEqual<T> = objectIs as IsEqual<T>,
): [value: T, setValue: (next: T) => void] {
  const [state, setState] = useState<DraftState<T> | null>(null);
  const timerRef = useRef<number | null>(null);
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  // Сверка с внешним значением — во время рендера (документированный паттерн
  // «adjusting state when a prop changes»): guarded, потому что
  // `reconcileDraft` возвращает тот же объект, когда менять нечего.
  const reconciled = reconcileDraft(state, committed, isEqual);
  if (reconciled !== state) {
    setState(reconciled);
  }
  const effective = reconciled;

  // Черновик отпущен (доехал наш коммит либо пришло внешнее изменение) —
  // отложенный коммит, если он ещё стоит, уже устарел.
  useEffect(() => {
    if (effective === null && timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [effective]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const setValue = useCallback(
    (next: T) => {
      setState((prev) => ({
        draft: next,
        base: prev ? prev.base : committed,
        lastSent: prev ? prev.lastSent : null,
        pending: true,
      }));
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState((prev) => (prev ? { ...prev, lastSent: next, pending: false } : prev));
        commitRef.current(next);
      }, delayMs);
    },
    [committed, delayMs],
  );

  const value = useMemo(
    () => (effective !== null ? effective.draft : committed),
    [effective, committed],
  );

  return [value, setValue];
}
