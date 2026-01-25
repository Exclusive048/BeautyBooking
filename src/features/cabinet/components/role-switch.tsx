"use client";

import { useTransition } from "react";

export function RoleSwitch({
  value,
  clientHref,
  providerHref,
}: {
  value: "client" | "provider";
  clientHref: string;
  providerHref: string;
}) {
  const [pending, startTransition] = useTransition();

  const base = "rounded-xl px-3 py-2 text-sm font-medium";
  const on = "bg-black text-white";
  const off = "border hover:bg-neutral-50";

  const go = (next: "client" | "provider") => {
    startTransition(async () => {
      const target = next === "client" ? clientHref : providerHref;
      const url = `/cabinet/set-role?role=${next}&next=${encodeURIComponent(target)}`;
      window.location.assign(url);
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
