"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type CabinetNavItem = {
  href: string;
  label: string;
};

type Props = {
  items: CabinetNavItem[];
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CabinetSideNav({ items }: Props) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 md:flex-col">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              active
                ? "border-black bg-black text-white"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

