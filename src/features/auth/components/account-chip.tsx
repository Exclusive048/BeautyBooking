"use client";

import { Badge } from "@/components/ui/badge";
import { useCurrentAccount } from "../use-current-account";

export function AccountChip() {
  const acc = useCurrentAccount();

  return (
    <div className="flex items-center gap-2">
      <Badge>{acc.type}</Badge>
      <span className="text-xs text-neutral-500">{acc.name}</span>
    </div>
  );
}
