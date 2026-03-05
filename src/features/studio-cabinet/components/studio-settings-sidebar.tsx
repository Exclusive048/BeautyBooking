"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { UI_TEXT } from "@/lib/ui/text";

const SETTINGS_ITEMS = [
  { href: "/cabinet/studio/settings/profile", label: UI_TEXT.studioCabinet.settings.profile },
  { href: "/cabinet/studio/settings/services", label: UI_TEXT.studioCabinet.settings.services },
  { href: "/cabinet/studio/settings/portfolio", label: UI_TEXT.studioCabinet.settings.portfolio },
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
