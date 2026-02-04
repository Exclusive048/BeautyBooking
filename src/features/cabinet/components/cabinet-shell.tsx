import Link from "next/link";
import type { ReactNode } from "react";
import { UI_TEXT } from "@/lib/ui/text";

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
          {subtitle ? <p className="mt-1 text-sm text-text-sec">{subtitle}</p> : null}
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
  const base = "relative rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300";
  const on =
    "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta";
  const off = "text-text-sec hover:bg-bg-input hover:text-text-main";

  const href = (tab: "bookings" | "profile") => {
    // Use relative tab navigation when baseHref is not provided.
    if (!baseHref) return `?tab=${tab}`;
    return `${baseHref}?tab=${tab}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={href("bookings")} className={`${base} ${active === "bookings" ? on : off}`}>
        {UI_TEXT.clientCabinet.common.myBookings}
      </Link>
      <Link href={href("profile")} className={`${base} ${active === "profile" ? on : off}`}>
        {UI_TEXT.clientCabinet.common.profile}
      </Link>
    </div>
  );
}
