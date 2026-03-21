"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { UI_TEXT } from "@/lib/ui/text";

const SETTINGS_ITEMS = [
  { href: "/cabinet/studio/settings?tab=main", label: UI_TEXT.studioCabinet.settings.profile },
  { href: "/cabinet/studio/settings?tab=services", label: UI_TEXT.studioCabinet.settings.services },
  { href: "/cabinet/studio/settings?tab=portfolio", label: UI_TEXT.studioCabinet.settings.portfolio },
];

function isActive(pathname: string, currentTab: string | null, href: string) {
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  if (!query) return true;

  const params = new URLSearchParams(query);
  const tab = params.get("tab");
  if (!tab) return true;
  return currentTab === tab;
}

export function StudioSettingsSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");

  return (
    <nav className="space-y-2">
      {SETTINGS_ITEMS.map((item) => (
        <SidebarItem
          key={item.href}
          href={item.href}
          label={item.label}
          active={isActive(pathname, currentTab, item.href)}
        />
      ))}
    </nav>
  );
}
