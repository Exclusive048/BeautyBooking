"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";

type CreatorInfo = {
  id: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  isValidated: boolean;
  isRejected: boolean;
  usageCount: number;
  createdAt: string;
  createdBy: CreatorInfo | null;
};

type CatalogResponse = {
  categories: CategoryItem[];
  moderation: {
    categories: CategoryItem[];
    tags: Array<{
      id: string;
      name: string;
      createdAt: string;
      createdBy: CreatorInfo | null;
    }>;
  };
};

const TABS = [
  { id: "categories", label: "Категории" },
  { id: "moderation", label: "Модерация" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function creatorLabel(creator: CreatorInfo | null) {
  if (!creator) return "—";
  return creator.displayName || creator.phone || creator.email || "—";
}

function statusLabel(category: CategoryItem) {
  if (category.isValidated) return "Активна";
  if (category.isRejected) return "Отклонена";
  return "На модерации";
}

export function AdminCatalog() {
  const [tab, setTab] = useState("categories");
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<CatalogResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить каталог");
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось обновить категорию");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить категорию");
    } finally {
      setBusyId(null);
    }
  };

  const moderationCategories = useMemo(() => data?.moderation.categories ?? [], [data]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка…</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Каталог и модерация</h1>
        <p className="mt-1 text-sm text-text-sec">Проверяйте категории и управляйте статусом публикации.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "categories" ? (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">Категория</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Использований</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data?.categories.length ? (
                data.categories.map((category, index) => (
                  <tr key={category.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                    <td className="px-4 py-3 text-sm text-text-main">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{category.icon}</span>
                        <span>{category.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-sec">{category.slug}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{statusLabel(category)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-main">{category.usageCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={category.isValidated || busyId === category.id}
                          onClick={() => handleAction(category.id, "approve")}
                        >
                          Подтвердить
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={category.isRejected || busyId === category.id}
                          onClick={() => handleAction(category.id, "reject")}
                        >
                          Отклонить
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-sec">
                    Категории не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "moderation" ? (
        <div className="space-y-4">
          <div className="lux-card overflow-hidden rounded-[24px]">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">Название</th>
                  <th className="px-4 py-3 text-left">Кто создал</th>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {moderationCategories.length ? (
                  moderationCategories.map((category, index) => (
                    <tr key={category.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">{category.name}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">{creatorLabel(category.createdBy)}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">{formatDate(category.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === category.id}
                            onClick={() => handleAction(category.id, "approve")}
                          >
                            Подтвердить
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === category.id}
                            onClick={() => handleAction(category.id, "reject")}
                          >
                            Отклонить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-sec">
                      Очередь категорий пуста.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="lux-card rounded-[24px] p-4 text-sm text-text-sec">
            Новых тегов нет. Если теги будут добавлены в продукт, они появятся в этой очереди.
          </div>
        </div>
      ) : null}
    </section>
  );
}
