"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";

const SETTINGS_ITEMS = [
  { href: "/cabinet/studio/settings/profile", label: "Профиль студии" },
  { href: "/cabinet/studio/settings/services", label: "Услуги и прайс" },
  { href: "/cabinet/studio/settings/portfolio", label: "Портфолио" },
];

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function StudioSettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {SETTINGS_ITEMS.map((item) => (
        <SidebarItem
          key={item.href}
          href={item.href}
          label={item.label}
          active={isActive(pathname, item.href)}
        />
      ))}
    </nav>
  );
}
