"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, type TabItem } from "@/components/ui/tabs";

export type PricingScope = "master" | "studio";

type Props = {
  active: PricingScope;
  items: ReadonlyArray<TabItem>;
};

export function PricingTabsClient({ active, items }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handleChange = (id: string) => {
    if (id !== "master" && id !== "studio") return;
    if (id === active) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    startTransition(() => {
      router.push(`/pricing?${params.toString()}`, { scroll: false });
    });
  };

  return <Tabs items={[...items]} value={active} onChange={handleChange} />;
}
