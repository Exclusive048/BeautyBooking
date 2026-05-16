"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.bookingsV2.pagination;

export function BookingsPagination({ nextCursor }: { nextCursor: string | null }) {
  const searchParams = useSearchParams();
  if (!nextCursor) return null;

  const params = new URLSearchParams(searchParams.toString());
  params.set("cursor", nextCursor);

  return (
    <div className="flex justify-center pt-2">
      <Link
        href={`?${params.toString()}`}
        scroll={false}
        className="rounded-xl border border-border-subtle bg-bg-card px-4 py-2 text-sm font-medium text-text-main transition-colors hover:bg-bg-input"
      >
        {T.loadMore}
      </Link>
    </div>
  );
}
