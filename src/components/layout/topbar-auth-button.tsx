"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks/use-me";
import { UI_TEXT } from "@/lib/ui/text";

export function TopbarAuthButton() {
  const { user, isLoading } = useMe();

  if (isLoading && !user) {
    return (
      <Button variant="secondary" disabled className="min-w-[80px]">
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
    <div className="flex items-center gap-2">
      <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
        <Link href="/become-master">{UI_TEXT.nav.becomeMaster}</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/login">{UI_TEXT.auth.login}</Link>
      </Button>
    </div>
  );
}
