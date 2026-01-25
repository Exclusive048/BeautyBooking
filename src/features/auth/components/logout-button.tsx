"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
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
      {pending ? "Выход..." : "Выход"}
    </Button>
  );
}
