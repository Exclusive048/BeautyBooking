"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.list;

export function ServicesSearch({
  initial,
  categoryTitle,
}: {
  initial: string;
  categoryTitle: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (draft === initial) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = draft.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      next.delete("service");
      router.replace(`?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, initial, router, searchParams]);

  const placeholder = categoryTitle
    ? T.searchPlaceholderTemplate.replace("{category}", categoryTitle)
    : T.searchPlaceholder;

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
        aria-hidden
      />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
