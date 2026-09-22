"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

export type CatalogCategory = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
};

/**
 * Верхнеуровневые категории каталога — один запрос на страницу.
 *
 * Список нужен сразу двум поверхностям: быстрым фильтрам в шапке и панели
 * фильтров (десктопный сайдбар смонтирован и на телефоне — он лишь скрыт
 * CSS'ом). Каждая раньше делала свой `fetch(..., { cache: "no-store" })`, то
 * есть одинаковый справочник грузился дважды на каждое открытие каталога.
 * Промис живёт на уровне модуля; неудача его сбрасывает, чтобы следующий
 * монтаж попробовал снова, а не получил навсегда пустой список.
 */
let categoriesPromise: Promise<CatalogCategory[]> | null = null;

function loadCategories(): Promise<CatalogCategory[]> {
  if (categoriesPromise) return categoriesPromise;
  categoriesPromise = fetch("/api/catalog/global-categories?status=APPROVED")
    .then(async (res) => {
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ categories: CatalogCategory[] }>
        | null;
      if (!res.ok || !json || !json.ok) throw new Error("categories");
      return json.data.categories.filter((category) => category.parentId === null);
    })
    .catch(() => {
      categoriesPromise = null;
      return [];
    });
  return categoriesPromise;
}

export function useTopCategories(): CatalogCategory[] {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadCategories().then((next) => {
      if (!cancelled) setCategories(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return categories;
}
