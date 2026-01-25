"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLastRole } from "@/features/cabinet/lib/actions";

export function RoleSwitch({
  value,
  clientHref,
  providerHref,
}: {
  value: "client" | "provider";
  clientHref: string;
  providerHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const base = "rounded-xl px-3 py-2 text-sm font-medium";
  const on = "bg-black text-white";
  const off = "border hover:bg-neutral-50";

  const go = (next: "client" | "provider") => {
    startTransition(async () => {
      await setLastRole(next);
      router.push(next === "client" ? clientHref : providerHref);
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => go("client")}
        className={`${base} ${value === "client" ? on : off}`}
      >
        Клиент
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => go("provider")}
        className={`${base} ${value === "provider" ? on : off}`}
      >
        Мастер/Студия
      </button>
    </div>
  );
}
