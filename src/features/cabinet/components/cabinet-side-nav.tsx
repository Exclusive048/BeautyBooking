"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";

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
          <SidebarItem
            key={item.href}
            href={item.href}
            label={item.label}
            active={active}
          />
        );
      })}
    </nav>
  );
}

