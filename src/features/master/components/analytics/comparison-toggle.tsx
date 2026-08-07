"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.period;

type Props = {
  checked: boolean;
};

/**
 * URL-driven checkbox: `?compare=off` means disabled. Default state is
 * "on" so masters always see trends unless they opt out — usually they
 * arrive on the page wanting to compare.
 */
export function ComparisonToggle({ checked }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = useId();

  const handleChange = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) {
      params.set("compare", "off");
    } else {
      params.delete("compare");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main"
    >
      <Checkbox id={id} checked={checked} onChange={handleChange} />
      <span>{T.comparisonLabel}</span>
    </label>
  );
}
