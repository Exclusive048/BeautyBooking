import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ClientsTabId } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.tabs;

const TABS: Array<{ id: ClientsTabId; label: string }> = [
  { id: "all", label: T.all },
  { id: "new", label: T.new },
  { id: "regular", label: T.regular },
  { id: "vip", label: T.vip },
  { id: "sleeping", label: T.sleeping },
];

type Props = {
  activeTab: ClientsTabId;
  tabCounts: Record<ClientsTabId, number>;
  /** Pass-through for ?sort= and ?q= so tab clicks preserve them. */
  sort: string;
  search: string;
};

/**
 * URL-driven tab bar. Plain `<Link>` per item; URL state is the source of
 * truth, server re-fetches when it changes. Active tab gets a primary
 * border-bottom and a tinted count chip.
 */
export function ClientsTabs({ activeTab, tabCounts, sort, search }: Props) {
  return (
    <nav
      aria-label="Фильтр клиентов"
      className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:-mx-0 lg:px-0"
    >
      <ul className="flex min-w-max items-center gap-1 border-b border-border-subtle">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const count = tabCounts[tab.id] ?? 0;
          const params = new URLSearchParams();
          if (tab.id !== "all") params.set("tab", tab.id);
          if (sort && sort !== "recent") params.set("sort", sort);
          if (search) params.set("q", search);
          const href = params.toString() ? `?${params.toString()}` : "?";
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={href}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-text-main"
                    : "border-transparent text-text-sec hover:text-text-main"
                )}
              >
                <span>{tab.label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                      active ? "bg-primary/10 text-primary" : "bg-bg-input text-text-sec"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
