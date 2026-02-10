"use client";

import { usePathname } from "next/navigation";
import { SidebarItem } from "@/components/ui/sidebar-item";

const ITEMS = [
  { href: "/admin", label: "📊 Дашборд" },
  { href: "/admin/catalog", label: "🗂 Каталог" },
  { href: "/admin/users", label: "👥 Пользователи" },
  { href: "/admin/billing", label: "💰 Финансы и тарифы" },
  { href: "/admin/settings", label: "⚙️ Настройки системы" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[calc(var(--topbar-h)+24px)] h-fit">
      <div className="lux-card rounded-[24px] border border-border-subtle/80 bg-bg-card/80 p-3 shadow-card backdrop-blur">
        <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-text-sec">
          Админ-панель
        </div>
        <nav className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              href={item.href}
              label={item.label}
              active={pathname === item.href}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
