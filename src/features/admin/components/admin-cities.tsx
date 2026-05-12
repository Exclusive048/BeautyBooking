"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.admin.cities;

type CityRow = {
  id: string;
  slug: string;
  name: string;
  nameGenitive: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
  autoCreated: boolean;
  providersCount: number;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = { items: CityRow[] };

type EditDraft = {
  name: string;
  nameGenitive: string;
  latitude: string;
  longitude: string;
  timezone: string;
  sortOrder: string;
  isActive: boolean;
  autoCreated: boolean;
};

type CreateDraft = {
  name: string;
  slug: string;
  nameGenitive: string;
  latitude: string;
  longitude: string;
  timezone: string;
  sortOrder: string;
  isActive: boolean;
};

function rowToDraft(row: CityRow): EditDraft {
  return {
    name: row.name,
    nameGenitive: row.nameGenitive ?? "",
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    timezone: row.timezone,
    sortOrder: String(row.sortOrder),
    isActive: row.isActive,
    autoCreated: row.autoCreated,
  };
}

function emptyCreateDraft(): CreateDraft {
  return {
    name: "",
    slug: "",
    nameGenitive: "",
    latitude: "55.7558",
    longitude: "37.6173",
    timezone: "Europe/Moscow",
    sortOrder: "100",
    isActive: true,
  };
}

export function AdminCities() {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<CityRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyCreateDraft());
  const [savingCreate, setSavingCreate] = useState(false);

  const [merging, setMerging] = useState<CityRow | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeStep, setMergeStep] = useState<"first" | "final">("first");
  const [mergingBusy, setMergingBusy] = useState(false);

  const [deleting, setDeleting] = useState<CityRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const loadCities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cities", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<ListResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.load);
      }
      setCities(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.load);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  const openEdit = (row: CityRow) => {
    setEditing(row);
    setEditDraft(rowToDraft(row));
  };

  const closeEdit = () => {
    setEditing(null);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    if (!editing || !editDraft) return;
    setSavingEdit(true);
    setError(null);
    try {
      const lat = Number(editDraft.latitude);
      const lng = Number(editDraft.longitude);
      const sortOrder = Number(editDraft.sortOrder);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(t.errors.invalidCoords);
      }
      if (!editDraft.name.trim()) {
        throw new Error(t.errors.emptyName);
      }
      const res = await fetch(`/api/admin/cities/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          nameGenitive: editDraft.nameGenitive.trim() || null,
          latitude: lat,
          longitude: lng,
          timezone: editDraft.timezone.trim(),
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
          isActive: editDraft.isActive,
          autoCreated: editDraft.autoCreated,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.update);
      }
      await loadCities();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.update);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (row: CityRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cities/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.update);
      }
      await loadCities();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.update);
    } finally {
      setBusyId(null);
    }
  };

  const submitCreate = async () => {
    setSavingCreate(true);
    setError(null);
    try {
      if (!createDraft.name.trim()) throw new Error(t.errors.emptyName);
      const lat = Number(createDraft.latitude);
      const lng = Number(createDraft.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(t.errors.invalidCoords);
      }
      const sortOrder = Number(createDraft.sortOrder);
      const res = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          slug: createDraft.slug.trim() || undefined,
          nameGenitive: createDraft.nameGenitive.trim() || null,
          latitude: lat,
          longitude: lng,
          timezone: createDraft.timezone.trim() || "Europe/Moscow",
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
          isActive: createDraft.isActive,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.create);
      }
      await loadCities();
      setCreating(false);
      setCreateDraft(emptyCreateDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.create);
    } finally {
      setSavingCreate(false);
    }
  };

  const openMerge = (row: CityRow) => {
    setMerging(row);
    setMergeTargetId("");
    setMergeStep("first");
  };

  const closeMerge = () => {
    setMerging(null);
    setMergeTargetId("");
    setMergeStep("first");
  };

  const submitMerge = async () => {
    if (!merging || !mergeTargetId) return;
    if (mergeStep === "first") {
      setMergeStep("final");
      return;
    }
    setMergingBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cities/${merging.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCityId: mergeTargetId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.merge);
      }
      await loadCities();
      closeMerge();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.merge);
    } finally {
      setMergingBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cities/${deleting.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.delete);
      }
      await loadCities();
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.delete);
    } finally {
      setDeletingBusy(false);
    }
  };

  const mergeCandidates = merging ? cities.filter((c) => c.id !== merging.id && c.isActive) : [];

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
          <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> {t.addCity}
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : cities.length === 0 ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.empty}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{t.table.name}</th>
                  <th className="px-4 py-3 text-left">{t.table.slug}</th>
                  <th className="px-4 py-3 text-right">{t.table.providers}</th>
                  <th className="px-4 py-3 text-right">{t.table.sortOrder}</th>
                  <th className="px-4 py-3 text-left">{t.table.status}</th>
                  <th className="px-4 py-3 text-right">{t.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                    <td className="px-4 py-3 text-sm text-text-main">
                      <div className="flex items-center gap-2">
                        <span>{row.name}</span>
                        {row.autoCreated ? (
                          <span className="rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200">
                            {t.autoCreatedBadge}
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                            {t.verifiedBadge}
                          </span>
                        )}
                      </div>
                      {row.nameGenitive ? (
                        <div className="text-xs text-text-sec">в {row.nameGenitive}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-sec">{row.slug}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-text-sec">
                      {row.providersCount}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-text-sec">
                      {row.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.isActive ? (
                        <span className="text-emerald-700 dark:text-emerald-400">●</span>
                      ) : (
                        <span className="rounded-full border border-border-subtle/60 bg-bg-input/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-text-sec">
                          {t.inactiveBadge}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEdit(row)}
                          aria-label={t.actions.edit}
                          title={t.actions.edit}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void toggleActive(row)}
                          disabled={busyId === row.id}
                          aria-label={row.isActive ? t.actions.deactivate : t.actions.activate}
                          title={row.isActive ? t.actions.deactivate : t.actions.activate}
                        >
                          {row.isActive ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openMerge(row)}
                          aria-label={t.actions.merge}
                          title={t.actions.merge}
                        >
                          <GitMerge className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDeleting(row)}
                          aria-label={t.actions.delete}
                          title={t.actions.delete}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      <ModalSurface open={Boolean(editing && editDraft)} onClose={closeEdit} title={t.editModal.title}>
        {editing && editDraft ? (
          <div className="space-y-3">
            <FieldLabel text={t.editModal.nameLabel}>
              <Input
                value={editDraft.name}
                onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel text={t.editModal.nameGenitiveLabel}>
              <Input
                value={editDraft.nameGenitive}
                onChange={(e) => setEditDraft({ ...editDraft, nameGenitive: e.target.value })}
                placeholder={t.editModal.nameGenitivePlaceholder}
              />
            </FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel text={t.editModal.latitudeLabel}>
                <Input
                  inputMode="decimal"
                  value={editDraft.latitude}
                  onChange={(e) => setEditDraft({ ...editDraft, latitude: e.target.value })}
                />
              </FieldLabel>
              <FieldLabel text={t.editModal.longitudeLabel}>
                <Input
                  inputMode="decimal"
                  value={editDraft.longitude}
                  onChange={(e) => setEditDraft({ ...editDraft, longitude: e.target.value })}
                />
              </FieldLabel>
            </div>
            <FieldLabel text={t.editModal.timezoneLabel}>
              <Input
                value={editDraft.timezone}
                onChange={(e) => setEditDraft({ ...editDraft, timezone: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel text={t.editModal.sortOrderLabel}>
              <Input
                inputMode="numeric"
                value={editDraft.sortOrder}
                onChange={(e) => setEditDraft({ ...editDraft, sortOrder: e.target.value })}
              />
            </FieldLabel>
            <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2">
              <span className="text-sm text-text-main">{t.editModal.isActiveLabel}</span>
              <Switch
                checked={editDraft.isActive}
                onCheckedChange={(checked) => setEditDraft({ ...editDraft, isActive: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2">
              <span className="text-sm text-text-main">{t.editModal.autoCreatedLabel}</span>
              <Switch
                checked={editDraft.autoCreated}
                onCheckedChange={(checked) => setEditDraft({ ...editDraft, autoCreated: checked })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={closeEdit} disabled={savingEdit}>
                {t.common.cancel}
              </Button>
              <Button onClick={() => void saveEdit()} disabled={savingEdit}>
                {savingEdit ? t.common.saving : t.common.save}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>

      {/* Create modal */}
      <ModalSurface open={creating} onClose={() => setCreating(false)} title={t.createModal.title}>
        <div className="space-y-3">
          <FieldLabel text={t.createModal.nameLabel}>
            <Input
              value={createDraft.name}
              onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
              placeholder={t.createModal.namePlaceholder}
            />
          </FieldLabel>
          <FieldLabel text={t.createModal.slugLabel}>
            <Input
              value={createDraft.slug}
              onChange={(e) => setCreateDraft({ ...createDraft, slug: e.target.value })}
              placeholder={t.createModal.slugPlaceholder}
            />
            <p className="mt-1 text-xs text-text-sec">{t.createModal.slugHint}</p>
          </FieldLabel>
          <FieldLabel text={t.editModal.nameGenitiveLabel}>
            <Input
              value={createDraft.nameGenitive}
              onChange={(e) => setCreateDraft({ ...createDraft, nameGenitive: e.target.value })}
              placeholder={t.editModal.nameGenitivePlaceholder}
            />
          </FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel text={t.editModal.latitudeLabel}>
              <Input
                inputMode="decimal"
                value={createDraft.latitude}
                onChange={(e) => setCreateDraft({ ...createDraft, latitude: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel text={t.editModal.longitudeLabel}>
              <Input
                inputMode="decimal"
                value={createDraft.longitude}
                onChange={(e) => setCreateDraft({ ...createDraft, longitude: e.target.value })}
              />
            </FieldLabel>
          </div>
          <FieldLabel text={t.editModal.timezoneLabel}>
            <Input
              value={createDraft.timezone}
              onChange={(e) => setCreateDraft({ ...createDraft, timezone: e.target.value })}
            />
          </FieldLabel>
          <FieldLabel text={t.editModal.sortOrderLabel}>
            <Input
              inputMode="numeric"
              value={createDraft.sortOrder}
              onChange={(e) => setCreateDraft({ ...createDraft, sortOrder: e.target.value })}
            />
          </FieldLabel>
          <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2">
            <span className="text-sm text-text-main">{t.editModal.isActiveLabel}</span>
            <Switch
              checked={createDraft.isActive}
              onCheckedChange={(checked) => setCreateDraft({ ...createDraft, isActive: checked })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={savingCreate}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void submitCreate()} disabled={savingCreate}>
              {savingCreate ? t.common.creating : t.common.create}
            </Button>
          </div>
        </div>
      </ModalSurface>

      {/* Merge modal */}
      <ModalSurface open={Boolean(merging)} onClose={closeMerge} title={t.mergeModal.title}>
        {merging ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border-subtle/60 bg-bg-input/40 p-3 text-sm">
              <div className="text-xs uppercase text-text-sec">{t.mergeModal.sourceLabel}</div>
              <div className="font-medium text-text-main">
                {merging.name}{" "}
                <span className="font-mono text-xs text-text-sec">({merging.slug})</span>
              </div>
              <div className="text-xs text-text-sec">
                {t.providersCount}: {merging.providersCount}
              </div>
            </div>

            <FieldLabel text={t.mergeModal.targetLabel}>
              <Select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
                <option value="" disabled>
                  {t.mergeModal.chooseTarget}
                </option>
                {mergeCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </Select>
            </FieldLabel>

            <div
              role="alert"
              className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {t.mergeModal.warning}
            </div>

            {mergeStep === "final" ? (
              <div
                role="alert"
                className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-200"
              >
                {t.mergeModal.confirmFinal}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={closeMerge} disabled={mergingBusy}>
                {t.common.cancel}
              </Button>
              <Button
                onClick={() => void submitMerge()}
                disabled={!mergeTargetId || mergingBusy}
                className="bg-red-600 hover:bg-red-700"
              >
                {mergingBusy
                  ? t.common.merging
                  : mergeStep === "first"
                    ? t.mergeModal.confirmFirst
                    : t.common.merge}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>

      {/* Delete confirm */}
      <ModalSurface
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t.deleteConfirm.title}
      >
        {deleting ? (
          <div className="space-y-3">
            <div className="text-sm text-text-main">
              {deleting.name}{" "}
              <span className="font-mono text-xs text-text-sec">({deleting.slug})</span>
            </div>
            {deleting.providersCount > 0 ? (
              <div
                role="alert"
                className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-200"
              >
                {t.deleteConfirm.blocked.replace("{count}", String(deleting.providersCount))}
              </div>
            ) : (
              <p className="text-sm text-text-sec">{t.deleteConfirm.body}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deletingBusy}>
                {t.common.cancel}
              </Button>
              <Button
                onClick={() => void submitDelete()}
                disabled={deletingBusy || deleting.providersCount > 0}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingBusy ? t.common.deleting : t.common.delete}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-sec">
        {text}
      </span>
      {children}
    </label>
  );
}
