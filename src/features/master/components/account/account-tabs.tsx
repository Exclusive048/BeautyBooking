"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, Shield, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.tabs;

export type AccountTabId = "notifications" | "security" | "account";

const TABS: Array<{ id: AccountTabId; label: string; icon: typeof Bell }> = [
  { id: "notifications", label: T.notifications, icon: Bell },
  { id: "security", label: T.security, icon: Shield },
  { id: "account", label: T.account, icon: User },
];

type Props = {
  active: AccountTabId;
};

/**
 * Three-way tab switcher backed by `?tab=` URL state. Non-sticky —
 * settings are infrequent navigation, so we don't pin the bar to the
 * viewport. Active state mirrors the page's current `?tab=` value
 * (read directly from the URL to stay in sync with browser back/forward).
 */
export function AccountTabs({ active }: Props) {
  const searchParams = useSearchParams();

  const buildHref = (id: AccountTabId): string => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "notifications") {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    const search = params.toString();
    return search ? `?${search}` : "?";
  };

  return (
    <nav
      className="flex flex-wrap items-center gap-1 overflow-x-auto rounded-2xl border border-border-subtle bg-bg-card p-1"
      aria-label="account-tabs"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={buildHref(tab.id)}
            scroll={false}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-bg-input text-text-main shadow-card"
                : "text-text-sec hover:text-text-main"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
