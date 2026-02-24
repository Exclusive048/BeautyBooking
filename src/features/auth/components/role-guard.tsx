"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useMe } from "@/lib/hooks/use-me";
import type { AccountType } from "../model/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function resolveAccountType(roles?: string[] | null): AccountType {
  if (!roles || roles.length === 0) return "GUEST";
  if (roles.includes("SUPERADMIN") || roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("STUDIO_ADMIN") || roles.includes("STUDIO")) return "STUDIO";
  if (roles.includes("MASTER")) return "MASTER";
  if (roles.includes("CLIENT")) return "CLIENT";
  return "GUEST";
}

export function RoleGuard({
  allow,
  children,
}: {
  allow: AccountType[];
  children: ReactNode;
}) {
  const { user } = useMe();
  const type = resolveAccountType(user?.roles);

  if (!allow.includes(type)) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-semibold text-neutral-900">Нет доступа</div>
          <div className="text-sm text-neutral-600">
            Текущая роль: <span className="font-semibold">{type}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/">На главную</Link>
            </Button>
            <Button asChild>
              <Link href="/catalog">В каталог</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
