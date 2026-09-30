"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApproveReviewDialog } from "@/features/admin-cabinet/reviews/components/approve-review-dialog";
import { DeleteReviewDialog } from "@/features/admin-cabinet/reviews/components/delete-review-dialog";
import { ReviewCard } from "@/features/admin-cabinet/reviews/components/review-card";
import { ReviewsEmpty } from "@/features/admin-cabinet/reviews/components/reviews-empty";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminReviewRow,
  AdminReviewTab,
} from "@/features/admin-cabinet/reviews/types";
import { useToast } from "@/components/ui/toast";

const T = UI_TEXT.adminPanel.reviews;

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
  const toast = useToast();
  const [approveTarget, setApproveTarget] = useState<AdminReviewRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReviewRow | null>(null);

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
      await fetchJsonWithAuth<unknown>(
        `/api/admin/reviews/${approveTarget.id}/approve`,
        { method: "POST" },
      );
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
      toast.success(T.toasts.approved);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.errorGeneric));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (reason: string) => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/admin/reviews/${deleteTarget.id}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || undefined }),
        },
      );
      // Optimistic — drop the row from the local list.
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(T.toasts.deleted);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.errorGeneric));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0 && !nextCursor) {
    return <ReviewsEmpty tab={tab} />;
  }

  return (
    <div className="space-y-3">
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
