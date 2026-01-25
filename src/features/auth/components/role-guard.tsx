"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useCurrentAccount } from "../use-current-account";
import type { AccountType } from "../model/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RoleGuard({
  allow,
  children,
}: {
  allow: AccountType[];
  children: ReactNode;
}) {
  const acc = useCurrentAccount();

  if (!allow.includes(acc.type)) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-semibold text-neutral-900">Нет доступа</div>
          <div className="text-sm text-neutral-600">
            Текущая роль: <span className="font-semibold">{acc.type}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/">На главную</Link>
            </Button>
            <Button asChild>
              <Link href="/providers">В каталог</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
