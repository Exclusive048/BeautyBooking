"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Tabs } from "@/components/ui/tabs";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { slugifyCategory } from "@/lib/slug";
import type { ApiResponse } from "@/lib/types/api";

type CategoryStatus = "PENDING" | "APPROVED" | "REJECTED";

type CreatorInfo = {
  id: string;
  name: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  profileHref: string;
};

type CategoryItem = {
  id: string;
  name: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  depth: number;
  fullPath: string;
  status: CategoryStatus;
  usageCount: number;
  visibleToAll: boolean;
  createdAt: string;
  createdBy: CreatorInfo | null;
};

type CategoriesResponse = {
  categories: CategoryItem[];
};

const TAB_ITEMS = [
  { id: "all", label: "Все" },
  { id: "pending", label: "На модерации" },
  { id: "approved", label: "Одобренные" },
  { id: "rejected", label: "Отклонённые" },
];

const TAB_STATUS: Record<string, CategoryStatus | null> = {
  all: null,
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function formatDate(value: string, timeZone: string) {
  return UI_FMT.dateTimeLong(value, { timeZone });
}

function statusLabel(status: CategoryStatus): string {
  if (status === "PENDING") return "На модерации";
  if (status === "APPROVED") return "Одобрена";
  return "Отклонена";
}

function creatorName(creator: CreatorInfo | null): string {
  if (!creator) return "Неизвестно";
  return creator.name || creator.displayName || creator.phone || creator.email || "Неизвестно";
}

export function AdminCatalog() {
  const viewerTimeZone = useViewerTimeZoneContext();

  const [tab, setTab] = useState<string>("all");
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

  const load = useCallback(async (nextTab: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const status = TAB_STATUS[nextTab] ?? null;
      if (status) params.set("status", status);
      const query = params.toString();
      const res = await fetch(`/api/admin/catalog/global-categories${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
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
    void load(tab);
  }, [load, tab]);

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

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/global-categories/${id}/approve`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось одобрить категорию");
      }
      setToast("Категория одобрена");
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось одобрить категорию");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/global-categories/${id}/reject`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось отклонить категорию");
      }
      setToast("Категория отклонена и удалена");
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отклонить категорию");
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
      await load(tab);
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
        <h1 className="text-2xl font-semibold text-text-main">Каталог категорий</h1>
        <p className="mt-1 text-sm text-text-sec">Модерация пользовательских категорий и управление каталогом.</p>
      </header>

      {toast ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
        <Button type="button" size="sm" onClick={() => setShowCreateModal(true)}>
          Добавить категорию
        </Button>
      </div>

      {tab === "pending" ? (
        <div className="space-y-3">
          {pendingCategories.length > 0 ? (
            pendingCategories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-2xl border border-white/8 bg-bg-card p-4"
              >
                <div>
                  <p className="font-medium">{category.fullPath || category.title}</p>
                  <p className="text-xs text-text-sec">
                    Предложил:{" "}
                    {category.createdBy ? (
                      <Link href={category.createdBy.profileHref} className="underline hover:text-text-main">
                        {creatorName(category.createdBy)}
                      </Link>
                    ) : (
                      "Неизвестно"
                    )}{" "}
                    · {formatDate(category.createdAt, viewerTimeZone)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApprove(category.id)}
                    disabled={busyId === category.id}
                    className="rounded-xl bg-green-500/15 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-60"
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject(category.id)}
                    disabled={busyId === category.id}
                    className="rounded-xl bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-60"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Категорий на модерации нет.</div>
          )}
        </div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">Категория</th>
                <th className="px-4 py-3 text-left">{UI_TEXT.admin.catalog.slugColumn}</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Видимость</th>
                <th className="px-4 py-3 text-left">Автор</th>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-right">Использований</th>
              </tr>
            </thead>
            <tbody>
              {categories.length > 0 ? (
                categories.map((category, index) => (
                  <tr key={category.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                    <td className="px-4 py-3 text-sm text-text-main">
                      <span className="mr-2 text-base">{category.icon ?? "•"}</span>
                      {category.fullPath || category.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-sec">{category.slug}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{statusLabel(category.status)}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">
                      {category.visibleToAll ? "Для всех" : "Только автор"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-sec">
                      {category.createdBy ? (
                        <Link href={category.createdBy.profileHref} className="underline hover:text-text-main">
                          {creatorName(category.createdBy)}
                        </Link>
                      ) : (
                        "Неизвестно"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-sec">{formatDate(category.createdAt, viewerTimeZone)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-text-main">{category.usageCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-sec">
                    Категории не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
            placeholder={UI_TEXT.admin.catalog.slugPlaceholder}
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
