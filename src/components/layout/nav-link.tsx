"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Props = {
  href: string;
  label: string;
};

/**
 * Topbar nav item with an active-state dot indicator under the label.
 *
 * Active when pathname matches exactly OR starts with `${href}/` — so a deep
 * route like `/catalog/category/manicure` keeps the parent `/catalog` lit.
 */
export function NavLink({ href, label }: Props) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        isActive
          ? "text-text-main"
          : "text-text-sec hover:bg-muted/60 hover:text-text-main",
      )}
    >
      {label}
      {isActive ? (
        <span
          aria-hidden
          className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
        />
      ) : null}
    </Link>
  );
}
