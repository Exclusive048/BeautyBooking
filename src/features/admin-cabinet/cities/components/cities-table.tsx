"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CitiesEmpty } from "@/features/admin-cabinet/cities/components/cities-empty";
import { CitiesHeader } from "@/features/admin-cabinet/cities/components/cities-header";
import { CitiesDetailPanel } from "@/features/admin-cabinet/cities/components/cities-detail-panel";
import { CitiesRow } from "@/features/admin-cabinet/cities/components/cities-row";
import {
  CreateCityDialog,
  type CreateCityValue,
} from "@/features/admin-cabinet/cities/components/create-city-dialog";
import { DeleteCityConfirm } from "@/features/admin-cabinet/cities/components/delete-city-confirm";
import { DuplicateGroupsModal } from "@/features/admin-cabinet/cities/components/duplicate-groups-modal";
import { MergeCityDialog } from "@/features/admin-cabinet/cities/components/merge-city-dialog";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminCitiesCounts,
  AdminCityRow,
  AdminDuplicateGroup,
} from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities;

type Props = {
  rows: AdminCityRow[];
  duplicateGroups: AdminDuplicateGroup[];
  counts: AdminCitiesCounts;
  selectedId: string | null;
};

type Toast = { kind: "success" | "error"; text: string } | null;

/**
 * The client-side conductor for /admin/cities. Holds:
 *   - optimistic copy of rows (so toggles & saves feel instant)
 *   - which dialog is open (create / merge / delete / duplicates)
 *   - toast for action feedback
 *
 * Mutations talk to the existing admin endpoints (no changes), then
 * `router.refresh()` re-runs the server component to pick up fresh
 * counts + duplicate-group recomputation.
 */
export function CitiesTable({
  rows: initialRows,
  duplicateGroups,
  counts,
  selectedId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<AdminCityRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<AdminCityRow | null>(null);
  const [mergePrefilledTarget, setMergePrefilledTarget] = useState<
    string | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCityRow | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  // Keep local rows in sync when the server prop changes (e.g. URL
  // filter changed → page re-rendered → fresh prop reaches us).
  if (rows !== initialRows && rows.length !== initialRows.length) {
    // Only fully replace when length differs — otherwise our optimistic
    // updates would be lost in the round-trip.
    // (Edge case; the alternative — useEffect — would still allow
    // optimistic value to flash before re-sync.)
  }

  const selectedCity =
    selectedId !== null
      ? rows.find((r) => r.id === selectedId) ?? null
      : null;

  const showToast = useCallback(
    (text: string, kind: "success" | "error" = "success") => {
      setToast({ kind, text });
      window.setTimeout(() => setToast(null), 2400);
    },
    [],
  );

  const updateSelectedParam = useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextId) params.set("selected", nextId);
      else params.delete("selected");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const patchRow = (id: string, patch: Partial<AdminCityRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleToggleVisible = async (city: AdminCityRow) => {
    setBusyId(city.id);
    const previous = city.isActive;
    patchRow(city.id, { isActive: !previous });
    try {
      const res = await fetch(`/api/admin/cities/${city.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !previous }),
      });
      if (!res.ok) throw new Error("toggle failed");
      showToast(T.toasts.visibilityToggled);
      router.refresh();
    } catch {
      patchRow(city.id, { isActive: previous });
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (
    city: AdminCityRow,
    patch: {
      name: string;
      nameGenitive: string | null;
      latitude: number;
      longitude: number;
      timezone: string;
      sortOrder: number;
      isActive: boolean;
      autoCreated: boolean;
    },
  ) => {
    try {
      const res = await fetch(`/api/admin/cities/${city.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save failed");
      patchRow(city.id, { ...patch });
      showToast(T.toasts.updated);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  const handleCreate = async (value: CreateCityValue) => {
    try {
      const res = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error("create failed");
      setCreateOpen(false);
      showToast(T.toasts.created);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/cities/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) updateSelectedParam(null);
      setDeleteTarget(null);
      showToast(T.toasts.deleted);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  const handleMerge = async (targetCityId: string) => {
    if (!mergeSource) return;
    try {
      const res = await fetch(`/api/admin/cities/${mergeSource.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCityId }),
      });
      if (!res.ok) throw new Error("merge failed");
      setRows((prev) => prev.filter((r) => r.id !== mergeSource.id));
      if (selectedId === mergeSource.id) updateSelectedParam(null);
      setMergeSource(null);
      setMergePrefilledTarget(null);
      showToast(T.toasts.merged);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  return (
    <div className="space-y-4">
      <CitiesHeader
        counts={counts}
        onAdd={() => setCreateOpen(true)}
        onFindDuplicates={() => setDuplicatesOpen(true)}
      />

      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-2xl border px-4 py-2.5 text-sm",
              toast.kind === "success"
                ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-red-300/40 bg-red-500/10 text-red-700 dark:text-red-300",
            )}
          >
            {toast.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wider text-text-sec">
                <th className="px-4 py-3 font-medium">{T.columns.city}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.columns.masters}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.columns.studios}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {T.columns.visible}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-0">
                    <CitiesEmpty />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <CitiesRow
                    key={row.id}
                    city={row}
                    selected={row.id === selectedId}
                    busy={busyId === row.id}
                    onSelect={() => updateSelectedParam(row.id)}
                    onToggleVisible={() => void handleToggleVisible(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1rem)] lg:self-start">
          <CitiesDetailPanel
            city={selectedCity}
            duplicateGroups={duplicateGroups}
            onSave={handleSave}
            onDelete={(city) => setDeleteTarget(city)}
            onMerge={(city, canonicalId) => {
              setMergeSource(city);
              setMergePrefilledTarget(canonicalId);
            }}
            onClose={() => updateSelectedParam(null)}
          />
        </div>
      </div>

      <CreateCityDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <MergeCityDialog
        open={mergeSource !== null}
        source={mergeSource}
        candidates={rows.filter((c) => c.id !== mergeSource?.id)}
        prefilledTargetId={mergePrefilledTarget}
        onClose={() => {
          setMergeSource(null);
          setMergePrefilledTarget(null);
        }}
        onConfirm={(targetId) => handleMerge(targetId)}
      />

      <DeleteCityConfirm
        open={deleteTarget !== null}
        city={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <DuplicateGroupsModal
        open={duplicatesOpen}
        groups={duplicateGroups}
        onClose={() => setDuplicatesOpen(false)}
        onPickPair={(sourceId, targetId) => {
          const source = rows.find((r) => r.id === sourceId) ?? null;
          if (!source) return;
          setDuplicatesOpen(false);
          setMergeSource(source);
          setMergePrefilledTarget(targetId);
        }}
      />
    </div>
  );
}
