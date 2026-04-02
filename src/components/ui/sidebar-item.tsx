import type { ElementType } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Props = {
  href: string;
  label: string;
  active?: boolean;
  className?: string;
  icon?: ElementType;
};

export function SidebarItem({ href, label, active = false, className, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
        active
          ? "bg-bg-card/80 pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
          : "text-text-sec hover:bg-bg-input/70 hover:text-text-main",
        className
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "text-primary" : "text-text-sec"
          )}
        />
      ) : null}
      {label}
    </Link>
  );
}
