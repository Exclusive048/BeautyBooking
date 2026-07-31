"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks/use-me";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * AUTH-GATE-01 — `authEnabled` comes from the server (`resolveAuthMethods().any`
 * in topbar.tsx); the flags behind it are server-only. Defaults to `true` so a
 * missed call site degrades to today's behaviour, not to a hidden login button.
 */
export function TopbarAuthButton({ authEnabled = true }: { authEnabled?: boolean }) {
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

  // AUTH-GATE-01: with no login method available the «Вход» CTA is dropped;
  // «Стать мастером» stays (it is a marketing page, not an auth entry point).
  // Its own sign-up CTA lands on /login, which renders the graceful state.
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
        <Link href="/become-master">{UI_TEXT.nav.becomeMaster}</Link>
      </Button>
      {authEnabled ? (
        <Button asChild size="sm">
          <Link href="/login">{UI_TEXT.auth.login}</Link>
        </Button>
      ) : null}
    </div>
  );
}
