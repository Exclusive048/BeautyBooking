"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Star, Reply, Pencil, Trash2, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";
import { Badge } from "@/components/ui/badge";
import type {
  ClientReviewItem,
  ClientReviewsKpi,
  PendingReviewBooking,
} from "@/lib/client-cabinet/reviews.service";
import { EditReviewModal } from "./edit-review-modal";

const T = UI_TEXT.clientCabinet.reviews;

type ReviewsApiPayload = {
  reviews: ClientReviewItem[];
  kpi: ClientReviewsKpi;
  pending: PendingReviewBooking[];
};

type Filter = "all" | "withReply" | "withoutReply" | "fiveStar";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as ReviewsApiPayload;
  });

export function ClientReviewsPage() {
  const { data, mutate, isLoading, error } = useSWR<ReviewsApiPayload>(
    "/api/cabinet/user/reviews",
    fetcher,
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [deleteTarget, setDeleteTarget] = useState<ClientReviewItem | null>(null);
  const [editTarget, setEditTarget] = useState<ClientReviewItem | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case "withReply":
        return data.reviews.filter((r) => r.hasReply);
      case "withoutReply":
        return data.reviews.filter((r) => !r.hasReply);
      case "fiveStar":
        return data.reviews.filter((r) => r.rating === 5);
      default:
        return data.reviews;
    }
  }, [data, filter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/reviews/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? T.deleteFailed);
    setDeleteTarget(null);
    await mutate();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">{T.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
      </header>

      <KpiBar kpi={data?.kpi} isLoading={isLoading} />

      {data?.pending.length ? (
        <PendingReviewsBlock pending={data.pending} />
      ) : null}

      <FilterBar value={filter} onChange={setFilter} />

      {error ? (
        <Card className="p-6 text-center text-sm text-text-sec">{T.loadFailed}</Card>
      ) : isLoading ? (
        <ReviewsListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onDelete={() => setDeleteTarget(r)}
              onEdit={() => setEditTarget(r)}
            />
          ))}
        </ul>
      )}

      {deleteTarget ? (
        <ConfirmModal
          open
          title={T.deleteConfirmTitle}
          message={T.deleteConfirmBody}
          confirmLabel={T.deleteConfirmAction}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {editTarget ? (
        <EditReviewModal
          key={`edit-${editTarget.id}`}
          review={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function KpiBar({
  kpi,
  isLoading,
}: {
  kpi?: ClientReviewsKpi;
  isLoading: boolean;
}) {
  const items = [
    { label: T.kpiTotal, value: kpi?.total ?? 0 },
    {
      label: T.kpiAverage,
      value: kpi?.averageRating ? kpi.averageRating.toFixed(1) : "—",
    },
    { label: T.kpiResponded, value: kpi?.respondedCount ?? 0 },
    { label: T.kpiPending, value: kpi?.pendingCount ?? 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {it.label}
          </div>
          <div className="mt-1 font-display text-2xl text-text-main">
            {isLoading ? "—" : it.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PendingReviewsBlock({ pending }: { pending: PendingReviewBooking[] }) {
  const head = pending.slice(0, 3);
  const more = pending.length - head.length;
  return (
    <Card className="border-primary/30 bg-bg-input/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Star className="h-4 w-4 fill-primary text-primary" aria-hidden />
        <div className="font-semibold text-text-main">{T.pendingTitle}</div>
      </div>
      <p className="mb-3 text-sm text-text-sec">{T.pendingDescription}</p>
      <ul className="space-y-2">
        {head.map((p) => (
          <li
            key={p.bookingId}
            className="flex items-center justify-between gap-3 rounded-xl bg-bg-card/60 p-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                url={p.target.avatarUrl}
                name={p.target.name}
                size={36}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-main">
                  {p.target.name}
                </div>
                <div className="truncate text-xs text-text-sec">
                  {p.serviceName ?? "—"}
                </div>
              </div>
            </div>
            <Link
              href={`/cabinet/bookings?review=${p.bookingId}`}
              className="shrink-0"
            >
              <Button size="sm" variant="primary">
                {T.pendingCta}
              </Button>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <div className="mt-2 text-center font-mono text-xs text-text-sec">
          {T.pendingMore(more)}
        </div>
      ) : null}
    </Card>
  );
}

function FilterBar({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const options: Array<{ value: Filter; label: string }> = [
    { value: "all", label: T.filterAll },
    { value: "withReply", label: T.filterWithReply },
    { value: "withoutReply", label: T.filterWithoutReply },
    { value: "fiveStar", label: T.filterFiveStar },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-primary text-white"
                : "bg-bg-input text-text-sec hover:bg-bg-input/70 hover:text-text-main"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({
  review,
  onDelete,
  onEdit,
}: {
  review: ClientReviewItem;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const profileHref = review.target.publicUsername
    ? `/u/${review.target.publicUsername}`
    : null;
  return (
    <li>
      <Card className="p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar url={review.target.avatarUrl} name={review.target.name} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {profileHref ? (
                  <Link
                    href={profileHref}
                    className="truncate text-sm font-semibold text-text-main hover:text-primary"
                  >
                    {review.target.name}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-semibold text-text-main">
                    {review.target.name}
                  </span>
                )}
                {profileHref ? (
                  <ExternalLink className="h-3.5 w-3.5 text-text-sec" aria-hidden />
                ) : null}
                {review.target.type === "STUDIO" ? (
                  <Badge variant="default">Студия</Badge>
                ) : null}
              </div>
              <div className="truncate text-xs text-text-sec">
                {review.serviceName ?? "—"} · {formatDate(review.createdAt)}
              </div>
            </div>
          </div>
          <StarRating rating={review.rating} />
        </header>

        {review.text ? (
          <p className="mt-3 text-sm leading-relaxed text-text-main">{review.text}</p>
        ) : null}

        {review.hasReply ? (
          <div className="mt-3 border-l-2 border-primary/60 bg-bg-input/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-primary">
              <Reply className="h-3 w-3" aria-hidden />
              {T.masterReplyLabel}
            </div>
            <p className="text-sm leading-relaxed text-text-main">
              {review.replyText}
            </p>
            {review.repliedAt ? (
              <div className="mt-1 text-xs text-text-sec">
                {formatDate(review.repliedAt)}
              </div>
            ) : null}
          </div>
        ) : null}

        {review.canEdit ? (
          <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle/60 pt-3">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {T.editAction}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {T.deleteAction}
            </Button>
            <span className="ml-auto text-xs text-text-sec">
              {T.editWindowHint}
            </span>
          </footer>
        ) : null}
      </Card>
    </li>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? "fill-primary text-primary"
              : "text-text-sec/40"
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}

function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  if (url) {
    return (
      <FocalImage
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-bg-input text-sm font-semibold text-text-sec"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <MessageSquare className="h-10 w-10 text-text-sec/40" aria-hidden />
      <div className="font-display text-base text-text-main">{T.empty}</div>
      <Link href="/catalog">
        <Button size="sm" variant="secondary">
          {T.emptyCta}
        </Button>
      </Link>
    </Card>
  );
}

function ReviewsListSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card className="h-28 animate-pulse bg-bg-input/40" />
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
