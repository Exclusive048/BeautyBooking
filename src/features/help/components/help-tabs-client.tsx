"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { HelpTab } from "@/features/help/content/help-content";

type Props = {
  active: HelpTab;
  items: ReadonlyArray<TabItem>;
};

/**
 * URL-routing wrapper around the shared <Tabs> component.
 *
 * Tab state lives in `?tab=master|studio` so anchor links survive copy-paste
 * and the back button preserves selection. We push with `scroll: false` to
 * keep the user's vertical position when toggling between decks.
 */
export function HelpTabsClient({ active, items }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handleChange = (id: string) => {
    if (id !== "master" && id !== "studio") return;
    if (id === active) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    startTransition(() => {
      router.push(`/help?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <Tabs items={[...items]} value={active} onChange={handleChange} />
  );
}
