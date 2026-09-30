"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.reviewsV2.pagination;

type Props = {
  nextCursor: string | null;
};

export function ReviewsPagination({ nextCursor }: Props) {
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
      <Button variant="secondary" size="sm" onClick={loadMore}>
        {T.loadMore}
      </Button>
    </div>
  );
}
