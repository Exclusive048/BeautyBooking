"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ApproveReviewDialog } from "@/features/admin-cabinet/reviews/components/approve-review-dialog";
import { DeleteReviewDialog } from "@/features/admin-cabinet/reviews/components/delete-review-dialog";
import { ReviewCard } from "@/features/admin-cabinet/reviews/components/review-card";
import { ReviewsEmpty } from "@/features/admin-cabinet/reviews/components/reviews-empty";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminReviewRow,
  AdminReviewTab,
} from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews;

type Toast = { kind: "success" | "error"; text: string } | null;

type Props = {
  rows: AdminReviewRow[];
  nextCursor: string | null;
  tab: AdminReviewTab;
};

/**
 * Reviews list with shared approve/delete dialog state. Optimistic
 * updates: approved reviews lose their reported markers without a
 * round-trip, deleted reviews disappear immediately. `router.refresh()`
 * resyncs the source-of-truth state (KPIs, counts) on next render.
 */
export function ReviewsList({ rows: initialRows, nextCursor, tab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<AdminReviewRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [approveTarget, setApproveTarget] = useState<AdminReviewRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReviewRow | null>(null);

  const showToast = useCallback(
    (text: string, kind: "success" | "error" = "success") => {
      setToast({ kind, text });
      window.setTimeout(() => setToast(null), 2400);
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("cursor", nextCursor);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }, [nextCursor, pathname, router, searchParams]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setBusyId(approveTarget.id);
    try {
      const res = await fetch(
        `/api/admin/reviews/${approveTarget.id}/approve`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("approve failed");
      // Optimistic — clear the reported flags in-place.
      setRows((prev) =>
        prev.map((r) =>
          r.id === approveTarget.id
            ? {
                ...r,
                isReported: false,
                reportedAt: null,
                reportReason: null,
                reportComment: null,
                isUrgent: false,
              }
            : r,
        ),
      );
      setApproveTarget(null);
      showToast(T.toasts.approved);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (reason: string) => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const res = await fetch(
        `/api/admin/reviews/${deleteTarget.id}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || undefined }),
        },
      );
      if (!res.ok) throw new Error("delete failed");
      // Optimistic — drop the row from the local list.
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast(T.toasts.deleted);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0 && !nextCursor) {
    return <ReviewsEmpty tab={tab} />;
  }

  return (
    <div className="space-y-3">
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

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <ReviewCard
            key={row.id}
            review={row}
            busy={busyId === row.id}
            onApprove={() => setApproveTarget(row)}
            onDelete={() => setDeleteTarget(row)}
          />
        ))}
      </div>

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="md" onClick={loadMore}>
            {T.pagination.loadMore}
          </Button>
        </div>
      ) : null}

      <ApproveReviewDialog
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
      />

      <DeleteReviewDialog
        open={deleteTarget !== null}
        review={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
