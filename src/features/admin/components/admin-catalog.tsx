"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { slugifyCategory } from "@/lib/slug";

type CreatorInfo = {
  id: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
};

type CategoryItem = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  depth: number;
  fullPath: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  usageCount: number;
  createdAt: string;
  createdBy: CreatorInfo | null;
};

type CategoriesResponse = {
  categories: CategoryItem[];
};

const TABS = [
  { id: "categories", label: "Категории" },
  { id: "moderation", label: "Модерация" },
];

function formatDate(value: string, timeZone: string) {
  return UI_FMT.dateTimeLong(value, { timeZone });
}

function creatorLabel(creator: CreatorInfo | null) {
  if (!creator) return "-";
  return creator.displayName || creator.phone || creator.email || "-";
}

function statusLabel(status: CategoryItem["status"]) {
  if (status === "APPROVED") return "Активна";
  if (status === "PENDING") return "На модерации";
  return "Отклонена";
}

export function AdminCatalog() {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const resetCreateForm = useCallback(() => {
    setNewTitle("");
    setNewSlug("");
    setNewIcon("");
    setSlugTouched(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog/categories", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<CategoriesResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить каталог");
      }
      setCategories(json.data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!slugTouched) {
      setNewSlug(slugifyCategory(newTitle));
    }
  }, [newTitle, slugTouched]);

  const handleStatus = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/categories/${id}/${action}`, { method: "POST" });
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

  const submitCategory = async (): Promise<void> => {
    if (!newTitle.trim()) {
      setError("Укажите название категории.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: newSlug.trim() ? newSlug.trim() : undefined,
          icon: newIcon.trim() ? newIcon.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ category: { id: string } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось создать категорию");
      }

      setShowCreateModal(false);
      resetCreateForm();
      setToast("Категория добавлена");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать категорию");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCategories = useMemo(
    () => categories.filter((category) => category.status === "PENDING"),
    [categories]
  );

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Каталог и модерация</h1>
        <p className="mt-1 text-sm text-text-sec">Проверяйте категории и управляйте статусом публикации.</p>
      </header>

      {toast ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "categories" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-sec">Всего категорий: {categories.length}</div>
            <Button type="button" size="sm" onClick={() => setShowCreateModal(true)}>
              Добавить категорию
            </Button>
          </div>

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
                {categories.length ? (
                  categories.map((category, index) => (
                    <tr key={category.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{category.icon ?? "•"}</span>
                          <span>{category.fullPath || category.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">{category.slug}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">{statusLabel(category.status)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-main">{category.usageCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          {category.status === "APPROVED" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyId === category.id}
                              onClick={() => handleStatus(category.id, "reject")}
                            >
                              Отклонить
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyId === category.id}
                              onClick={() => handleStatus(category.id, "approve")}
                            >
                              Подтвердить
                            </Button>
                          )}
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
                {pendingCategories.length ? (
                  pendingCategories.map((category, index) => (
                    <tr key={category.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">{category.fullPath || category.title}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">{creatorLabel(category.createdBy)}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {formatDate(category.createdAt, viewerTimeZone)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === category.id}
                            onClick={() => handleStatus(category.id, "reject")}
                          >
                            Отклонить
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === category.id}
                            onClick={() => handleStatus(category.id, "approve")}
                          >
                            Подтвердить
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

      <ModalSurface
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title="Новая категория"
      >
        <div className="space-y-4">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Название категории"
          />
          <Input
            value={newSlug}
            onChange={(event) => {
              setNewSlug(event.target.value);
              setSlugTouched(true);
            }}
            placeholder="slug (необязательно)"
          />
          <Input
            value={newIcon}
            onChange={(event) => setNewIcon(event.target.value)}
            placeholder="Иконка (например •)"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                resetCreateForm();
              }}
            >
              Отмена
            </Button>
            <Button type="button" onClick={() => void submitCategory()} disabled={submitting}>
              {submitting ? "Создаём..." : "Создать"}
            </Button>
          </div>
        </div>
      </ModalSurface>
    </section>
  );
}
