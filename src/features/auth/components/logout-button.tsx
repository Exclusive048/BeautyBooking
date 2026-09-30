"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

type LogoutButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function LogoutButton({ variant, size, className }: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await fetch("/logout", { method: "GET", cache: "no-store" });
          } finally {
            // Full page reload — clears SWR cache, React state, and all client-side data.
            // router.replace() leaves the SWR in-memory cache intact, causing stale user
            // data (phone, name) to remain visible in the navbar until the next revalidation.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- полная перезагрузка сбрасывает SWR и данные прежнего пользователя
            window.location.href = "/";
          }
        });
      }}
    >
      {pending ? UI_TEXT.nav.logoutPending : UI_TEXT.nav.logout}
    </Button>
  );
}
