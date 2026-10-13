"use client";

import { useState } from "react";

/**
 * UX-PASS-01: строки списков админки, пришедшие с сервера.
 *
 * Список рендерит сервер, а клиент держит копию строк ради оптимистичных
 * правок (одобрили, отменили, вернули деньги — строка меняется сразу).
 * Прежде копия заводилась `useState(initialRows)` и с сервером больше не
 * сверялась: фильтры, вкладки, поиск, «Загрузить ещё» и `router.refresh()`
 * меняли адрес и данные страницы, а таблица показывала строки первой
 * загрузки. Смена search-параметров страницу не перемонтирует (ключ
 * сегмента в App Router — без них), поэтому состояние переживает навигацию.
 */

type RowsUpdater<T> = (rows: T[]) => T[];

/**
 * Список без постраничной подгрузки: новый ответ сервера целиком заменяет
 * строки (тот же приём, что в `catalog-table.tsx`).
 */
export function useServerRows<T>(serverRows: T[]) {
  const [rows, setRows] = useState<T[]>(serverRows);
  const [syncedRows, setSyncedRows] = useState(serverRows);
  if (syncedRows !== serverRows) {
    setSyncedRows(serverRows);
    setRows(serverRows);
  }
  return [rows, setRows] as const;
}

export type ServerPage<T> = { cursor: string | null; rows: T[] };

/**
 * Куда положить очередную страницу ответа сервера.
 *  - сменились фильтры (`reset`) — список начинается заново с этой страницы;
 *  - курсор новый — «Загрузить ещё»: страница дописывается в конец;
 *  - курсор уже есть — `router.refresh()` либо возврат к более ранней
 *    странице: она заменяется, всё, что подгружено после неё, отбрасывается
 *    (сервер о них в этом ответе ничего не сказал).
 */
export function mergeServerPage<T>(
  pages: ServerPage<T>[],
  page: ServerPage<T>,
  reset: boolean,
): ServerPage<T>[] {
  if (reset) return [page];
  const index = pages.findIndex((p) => p.cursor === page.cursor);
  if (index === -1) return [...pages, page];
  return [...pages.slice(0, index), page];
}

/** Страницы — в один список; строка, повторённая на стыке страниц, — один раз. */
export function flattenServerPages<T extends { id: string }>(pages: ServerPage<T>[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/**
 * Список с курсором в адресе (`?cursor=`): «Загрузить ещё» дописывает
 * страницу, смена фильтров (`resetKey`) начинает список заново.
 *
 * `setRows` применяет правку к каждой странице отдельно — годится для
 * построчных правок (`map`, `filter`), которыми и пользуются списки.
 */
export function useCursorPagedRows<T extends { id: string }>(
  serverRows: T[],
  { cursor, resetKey }: { cursor: string | null; resetKey: string },
) {
  const [pages, setPages] = useState<ServerPage<T>[]>([{ cursor, rows: serverRows }]);
  const [synced, setSynced] = useState({ rows: serverRows, resetKey });
  if (synced.rows !== serverRows) {
    setSynced({ rows: serverRows, resetKey });
    setPages(mergeServerPage(pages, { cursor, rows: serverRows }, synced.resetKey !== resetKey));
  }

  const setRows = (updater: RowsUpdater<T>) => {
    setPages((prev) => prev.map((page) => ({ ...page, rows: updater(page.rows) })));
  };

  return [flattenServerPages(pages), setRows] as const;
}
