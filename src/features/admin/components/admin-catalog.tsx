"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
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

const TAB_STATUS: Record<string, CategoryStatus | null> = {
  all: null,
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function formatDate(value: string, timeZone: string) {
  return UI_FMT.dateTimeLong(value, { timeZone });
}

function statusLabel(status: CategoryStatus, t: typeof UI_TEXT.admin.catalog): string {
  if (status === "PENDING") return t.status.pending;
  if (status === "APPROVED") return t.status.approved;
  return t.status.rejected;
}

function statusBadgeClass(status: CategoryStatus): string {
  if (status === "APPROVED") return "text-green-700 dark:text-green-400";
  if (status === "REJECTED") return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

function creatorName(creator: CreatorInfo | null, t: typeof UI_TEXT.admin.catalog): string {
  if (!creator) return t.unknownAuthor;
  return creator.name || creator.displayName || creator.phone || creator.email || t.unknownAuthor;
}

export function AdminCatalog() {
  const t = UI_TEXT.admin.catalog;
  const viewerTimeZone = useViewerTimeZoneContext();

  const [tab, setTab] = useState<string>("all");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<CategoryItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editStatus, setEditStatus] = useState<CategoryStatus>("PENDING");
  const [editSaving, setEditSaving] = useState(false);

  const tabs = useMemo(
    () => [
      { id: "all", label: t.tabs.all },
      { id: "pending", label: t.tabs.pending },
      { id: "approved", label: t.tabs.approved },
      { id: "rejected", label: t.tabs.rejected },
    ],
    [t.tabs.all, t.tabs.approved, t.tabs.pending, t.tabs.rejected]
  );

  const resetCreateForm = useCallback(() => {
    setNewTitle("");
    setNewSlug("");
    setNewIcon("");
    setNewParentId("");
    setSlugTouched(false);
  }, []);

  const load = useCallback(
    async (nextTab: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const status = TAB_STATUS[nextTab] ?? null;
        if (status) params.set("status", status);
        const query = params.toString();
        const res = await fetch(
          `/api/admin/catalog/global-categories${query ? `?${query}` : ""}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as ApiResponse<CategoriesResponse> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.errors.load);
        }
        setCategories(json.data.categories);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errors.load);
      } finally {
        setLoading(false);
      }
    },
    [t.errors.load]
  );

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

  const showToast = (message: string) => setToast(message);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/global-categories/${id}/approve`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.approve);
      }
      showToast(t.toast.approved);
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.approve);
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
        throw new Error(json && !json.ok ? json.error.message : t.errors.reject);
      }
      showToast(t.toast.rejected);
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.reject);
    } finally {
      setBusyId(null);
    }
  };

  const submitCategory = async (): Promise<void> => {
    if (!newTitle.trim()) {
      setError(t.errors.emptyTitle);
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
          parentId: newParentId.trim() ? newParentId.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        category: { id: string };
      }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.create);
      }
      setShowCreateModal(false);
      resetCreateForm();
      showToast(t.toast.created);
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.create);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (category: CategoryItem) => {
    setEditTarget(category);
    setEditTitle(category.title || category.name || "");
    setEditIcon(category.icon ?? "");
    setEditParentId(category.parentId ?? "");
    setEditStatus(category.status);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditTitle("");
    setEditIcon("");
    setEditParentId("");
    setEditStatus("PENDING");
  };

  const saveEdit = async (): Promise<void> => {
    if (!editTarget) return;
    if (!editTitle.trim()) {
      setError(t.errors.emptyTitle);
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/categories/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          icon: editIcon.trim() ? editIcon.trim() : null,
          parentId: editParentId.trim() ? editParentId.trim() : null,
          status: editStatus,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.update);
      }
      closeEdit();
      showToast(t.toast.updated);
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.update);
    } finally {
      setEditSaving(false);
    }
  };

  const pendingCategories = useMemo(
    () => categories.filter((category) => category.status === "PENDING"),
    [categories]
  );

  // Categories available as parents (exclude current editing category itself)
  const parentOptions = useMemo(
    () => categories.filter((c) => c.status === "APPROVED" && c.id !== editTarget?.id),
    [categories, editTarget]
  );

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
      </header>

      {toast ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs items={tabs} value={tab} onChange={setTab} />
        <Button type="button" size="sm" onClick={() => setShowCreateModal(true)}>
          {t.addCategory}
        </Button>
      </div>

      {tab === "pending" ? (
        <div className="space-y-3">
          {pendingCategories.length > 0 ? (
            pendingCategories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{category.fullPath || category.title}</p>
                  <p className="text-xs text-text-sec">
                    {t.suggestedBy}:{" "}
                    {category.createdBy ? (
                      <Link
                        href={category.createdBy.profileHref}
                        className="underline hover:text-text-main"
                      >
                        {creatorName(category.createdBy, t)}
                      </Link>
                    ) : (
                      t.unknownAuthor
                    )}{" "}
                    · {formatDate(category.createdAt, viewerTimeZone)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="icon"
                    size="sm"
                    onClick={() => openEdit(category)}
                    aria-label={t.actions.edit}
                  >
                    ✎
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleApprove(category.id)}
                    disabled={busyId === category.id}
                  >
                    {t.actions.approve}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleReject(category.id)}
                    disabled={busyId === category.id}
                  >
                    {t.actions.reject}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">
              {t.pendingEmpty}
            </div>
          )}
        </div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{t.table.category}</th>
                  <th className="px-4 py-3 text-left">{t.slugColumn}</th>
                  <th className="px-4 py-3 text-left">{t.table.status}</th>
                  <th className="px-4 py-3 text-left">{t.table.visibility}</th>
                  <th className="px-4 py-3 text-left">{t.table.author}</th>
                  <th className="px-4 py-3 text-left">{t.table.date}</th>
                  <th className="px-4 py-3 text-right">{t.table.usageCount}</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {categories.length > 0 ? (
                  categories.map((category, index) => (
                    <tr
                      key={category.id}
                      className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}
                    >
                      <td className="px-4 py-3 text-sm text-text-main">
                        <span className="mr-2 text-base">{category.icon ?? "•"}</span>
                        {category.fullPath || category.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">{category.slug}</td>
                      <td className={`px-4 py-3 text-sm font-medium ${statusBadgeClass(category.status)}`}>
                        {statusLabel(category.status, t)}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {category.visibleToAll ? t.visibility.all : t.visibility.authorOnly}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {category.createdBy ? (
                          <Link
                            href={category.createdBy.profileHref}
                            className="underline hover:text-text-main"
                          >
                            {creatorName(category.createdBy, t)}
                          </Link>
                        ) : (
                          t.unknownAuthor
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        {formatDate(category.createdAt, viewerTimeZone)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-text-main">
                        {category.usageCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {category.status !== "APPROVED" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleApprove(category.id)}
                              disabled={busyId === category.id}
                            >
                              {t.actions.approve}
                            </Button>
                          ) : null}
                          {category.status !== "REJECTED" ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => void handleReject(category.id)}
                              disabled={busyId === category.id}
                            >
                              {t.actions.reject}
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(category)}
                          >
                            {t.actions.edit}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-text-sec">
                      {t.tableEmpty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <ModalSurface
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title={t.modal.title}
      >
        <div className="space-y-4">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={t.modal.titlePlaceholder}
          />
          <Input
            value={newSlug}
            onChange={(event) => {
              setNewSlug(event.target.value);
              setSlugTouched(true);
            }}
            placeholder={t.slugPlaceholder}
          />
          <Input
            value={newIcon}
            onChange={(event) => setNewIcon(event.target.value)}
            placeholder={t.modal.iconPlaceholder}
          />
          <div>
            <label className="block text-xs text-text-sec">{t.modal.parentLabel}</label>
            <Select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className="mt-1"
            >
              <option value="">{t.modal.noParent}</option>
              {categories
                .filter((c) => c.status === "APPROVED")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullPath || c.title}
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                resetCreateForm();
              }}
            >
              {t.actions.cancel}
            </Button>
            <Button type="button" onClick={() => void submitCategory()} disabled={submitting}>
              {submitting ? t.actions.creating : t.actions.create}
            </Button>
          </div>
        </div>
      </ModalSurface>

      {/* Edit Modal */}
      <ModalSurface open={Boolean(editTarget)} onClose={closeEdit} title={t.modal.editTitle}>
        {editTarget ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-text-sec">{t.modal.titlePlaceholder}</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t.modal.titlePlaceholder}
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs text-text-sec">{t.modal.iconPlaceholder}</label>
              <Input
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                placeholder={t.modal.iconPlaceholder}
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs text-text-sec">{t.modal.parentLabel}</label>
              <Select
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                className="mt-1"
              >
                <option value="">{t.modal.noParent}</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullPath || c.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-text-sec">{t.modal.statusLabel}</label>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as CategoryStatus)}
                className="mt-1"
              >
                <option value="PENDING">{t.status.pending}</option>
                <option value="APPROVED">{t.status.approved}</option>
                <option value="REJECTED">{t.status.rejected}</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeEdit} disabled={editSaving}>
                {t.actions.cancel}
              </Button>
              <Button type="button" onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? t.actions.saving : t.actions.save}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}
