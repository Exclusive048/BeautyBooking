"use client";

import { Badge } from "@/components/ui/badge";
import { useMe } from "@/lib/hooks/use-me";
import type { MeUser } from "@/lib/hooks/use-me";
import type { AccountType } from "../model/types";

function resolveAccountType(roles?: string[] | null): AccountType {
  if (!roles || roles.length === 0) return "GUEST";
  if (roles.includes("SUPERADMIN") || roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("STUDIO_ADMIN") || roles.includes("STUDIO")) return "STUDIO";
  if (roles.includes("MASTER")) return "MASTER";
  if (roles.includes("CLIENT")) return "CLIENT";
  return "GUEST";
}

function resolveAccountName(user: MeUser | null): string {
  if (!user) return "Guest";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.displayName ?? (name || null) ?? user.phone ?? user.email ?? "User";
}

export function AccountChip() {
  const { user } = useMe();
  const type = resolveAccountType(user?.roles);
  const name = resolveAccountName(user);

  return (
    <div className="flex items-center gap-2">
      <Badge>{type}</Badge>
      <span className="text-xs text-neutral-500">{name}</span>
    </div>
  );
}
