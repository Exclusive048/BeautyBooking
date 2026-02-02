import Link from "next/link";
import type { ReactNode } from "react";
import { UI_TEXTS } from "@/lib/ui-texts/ru";

export function CabinetShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-neutral-600">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      {children}
    </div>
  );
}

export function CabinetTabs({
  active,
  baseHref,
}: {
  active: "bookings" | "profile";
  baseHref?: string;
}) {
  const base = "rounded-xl px-3 py-2 text-sm font-medium";
  const on = "bg-black text-white";
  const off = "border hover:bg-neutral-50";

  const href = (tab: "bookings" | "profile") => {
    // Если baseHref не задан, используем относительную навигацию.
    if (!baseHref) return `?tab=${tab}`;
    return `${baseHref}?tab=${tab}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={href("bookings")} className={`${base} ${active === "bookings" ? on : off}`}>
        {UI_TEXTS.common.myBookings}
      </Link>
      <Link href={href("profile")} className={`${base} ${active === "profile" ? on : off}`}>
        {UI_TEXTS.common.profile}
      </Link>
    </div>
  );
}
