"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.clientsV2.pagination;

type Props = {
  nextCursor: string | null;
};

/**
 * Cursor pagination — server-side via `?cursor=<key>`. Renders nothing
 * when the current page is the last (no more rows).
 */
export function ClientsPagination({ nextCursor }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!nextCursor) return null;

  const loadMore = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("cursor", nextCursor);
    router.push(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={loadMore}
        className="rounded-full border border-border-subtle bg-bg-card px-4 py-2 text-sm font-medium text-text-main transition-colors hover:bg-bg-input/60"
      >
        {T.loadMore}
      </button>
    </div>
  );
}
