"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SearchX } from "lucide-react";
import { CatalogHeader } from "@/features/admin-cabinet/catalog/components/catalog-header";
import { CatalogRowActions } from "@/features/admin-cabinet/catalog/components/catalog-row-actions";
import { CatalogStatusPill } from "@/features/admin-cabinet/catalog/components/catalog-status-pill";
import {
  CreateCategoryDialog,
  type CreateDialogValue,
} from "@/features/admin-cabinet/catalog/components/create-category-dialog";
import { RejectConfirmDialog } from "@/features/admin-cabinet/catalog/components/reject-confirm-dialog";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminCategoryCounts,
  AdminCategoryParentOption,
  AdminCategoryRow,
} from "@/features/admin-cabinet/catalog/types";

const T = UI_TEXT.adminPanel.catalog;

type Props = {
  initialRows: AdminCategoryRow[];
  parentOptions: AdminCategoryParentOption[];
  counts: AdminCategoryCounts;
};

type Toast = { kind: "success" | "error"; text: string } | null;

/**
 * Client wrapper around the catalog table. Owns:
 *   - optimistic row updates after approve/reject/edit/create
 *   - dialog state for "create category", "edit category", "reject"
 *   - light-weight toast for action feedback
 *
 * On successful mutation we `router.refresh()` so the server-rendered
 * table re-fetches with the new state. Optimistic update is what the
 * user sees in the meantime — eliminates the "click → spinner → row
 * updates" stutter.
 */
export function CatalogTable({ initialRows, parentOptions, counts }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminCategoryRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminCategoryRow | null>(null);

  // Re-sync local state if the server-rendered list changes
  // (e.g. URL filter changed and the page re-rendered).
  if (rows !== initialRows && rows.length === 0) {
    // initial mount: keep server rows
  }

  const showToast = (text: string, kind: "success" | "error" = "success") => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 2400);
  };

  const patchRow = (id: string, patch: Partial<AdminCategoryRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleApprove = async (row: AdminCategoryRow) => {
    setBusyId(row.id);
    const prevStatus = row.status;
    patchRow(row.id, { status: "APPROVED" });
    try {
      const res = await fetch(
        `/api/admin/catalog/categories/${row.id}/approve`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("approve failed");
      showToast(T.toasts.approved);
      router.refresh();
    } catch {
      patchRow(row.id, { status: prevStatus });
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (row: AdminCategoryRow, reason: string) => {
    setBusyId(row.id);
    const prevStatus = row.status;
    patchRow(row.id, { status: "REJECTED" });
    try {
      const res = await fetch(
        `/api/admin/catalog/categories/${row.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) throw new Error("reject failed");
      setRejectTarget(null);
      showToast(T.toasts.rejected);
      router.refresh();
    } catch {
      patchRow(row.id, { status: prevStatus });
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitDialog = async (value: CreateDialogValue) => {
    const isEdit = !!editing;
    try {
      const res = await fetch(
        isEdit
          ? `/api/admin/catalog/categories/${editing!.id}`
          : "/api/admin/catalog/categories",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: value.name,
            parentId: value.parentId,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const isCycle = text.includes("Circular") || text.includes("BAD_REQUEST");
        showToast(isCycle ? T.toasts.cycleError : T.toasts.errorGeneric, "error");
        return;
      }
      setCreateOpen(false);
      setEditing(null);
      showToast(isEdit ? T.toasts.updated : T.toasts.created);
      // Reload server rows — count + new row will appear via refresh.
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  return (
    <div className="space-y-4">
      <CatalogHeader counts={counts} onAdd={() => setCreateOpen(true)} />

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

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
        {/* Mobile: cards stacked. Desktop: table. */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wider text-text-sec">
                <th className="px-4 py-3 font-medium">{T.columns.category}</th>
                <th className="px-4 py-3 font-medium">{T.columns.parent}</th>
                <th className="px-4 py-3 font-medium">{T.columns.status}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.columns.services}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.columns.providers}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {T.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-bg-input/40">
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-medium text-text-main">
                        {row.name}
                      </p>
                      {row.proposer ? (
                        <p className="mt-0.5 text-xs text-text-sec">
                          {T.proposedBy}: {row.proposer.displayName ?? "—"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-text-sec">
                      {row.parent ? row.parent.name : T.rootParent}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <CatalogStatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-text-main">
                      {row.servicesCount}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-text-main">
                      {row.providersCount}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <CatalogRowActions
                        status={row.status}
                        busy={busyId === row.id}
                        onApprove={() => void handleApprove(row)}
                        onReject={() => setRejectTarget(row)}
                        onEdit={() => setEditing(row)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-border-subtle md:hidden">
          {rows.length === 0 ? (
            <li>
              <EmptyState />
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-main">
                      {row.name}
                    </p>
                    <p className="mt-0.5 text-xs text-text-sec">
                      {row.parent ? row.parent.name : T.rootParent}
                    </p>
                  </div>
                  <CatalogStatusPill status={row.status} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-text-sec">
                    <span className="tabular-nums text-text-main">
                      {row.servicesCount}
                    </span>{" "}
                    {T.columns.services.toLowerCase()}
                    <span className="mx-2 text-text-sec/40">·</span>
                    <span className="tabular-nums text-text-main">
                      {row.providersCount}
                    </span>{" "}
                    {T.columns.providers.toLowerCase()}
                  </p>
                  <CatalogRowActions
                    status={row.status}
                    busy={busyId === row.id}
                    onApprove={() => void handleApprove(row)}
                    onReject={() => setRejectTarget(row)}
                    onEdit={() => setEditing(row)}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <CreateCategoryDialog
        open={createOpen || editing !== null}
        editing={editing}
        parentOptions={parentOptions}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmitDialog}
      />

      <RejectConfirmDialog
        open={rejectTarget !== null}
        categoryName={rejectTarget?.name ?? ""}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) =>
          rejectTarget ? handleReject(rejectTarget, reason) : Promise.resolve()
        }
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <SearchX className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
      <p className="mb-1 font-display text-base text-text-main">
        {T.empty.title}
      </p>
      <p className="max-w-xs text-sm text-text-sec">{T.empty.hint}</p>
    </div>
  );
}
