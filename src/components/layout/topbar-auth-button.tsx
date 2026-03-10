"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks/use-me";
import { UI_TEXT } from "@/lib/ui/text";

export function TopbarAuthButton() {
  const { user, isLoading } = useMe();

  if (isLoading && !user) {
    return (
      <Button variant="secondary" disabled className="min-w-[110px]">
        {UI_TEXT.status.loading}
      </Button>
    );
  }

  if (user) {
    const displayName =
      user.displayName?.trim() || user.phone || user.email || UI_TEXT.nav.profile;
    return (
      <Button asChild variant="secondary" className="max-w-[180px]">
        <Link href="/cabinet/profile" title={displayName} className="truncate">
          {displayName}
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild>
      <Link href="/login">{UI_TEXT.auth.login}</Link>
    </Button>
  );
}

