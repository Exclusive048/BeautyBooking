"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type LogoutButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function LogoutButton({ variant, size, className }: LogoutButtonProps) {
  const router = useRouter();
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
            router.replace("/");
            router.refresh();
          }
        });
      }}
    >
      {pending ? UI_TEXT.auth.logoutPending : UI_TEXT.auth.logout}
    </Button>
  );
}
