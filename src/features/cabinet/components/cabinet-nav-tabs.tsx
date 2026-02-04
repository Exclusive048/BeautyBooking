import Link from "next/link";

export type CabinetNavItem = {
  id: string;
  label: string;
  href: string;
};

export function CabinetNavTabs({
  items,
  activeId,
}: {
  items: CabinetNavItem[];
  activeId: string;
}) {
  const base = "relative rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all duration-300";
  const on =
    "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta";
  const off = "text-text-sec hover:bg-bg-input hover:text-text-main";

  return (
    <div className="flex w-full items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`${base} ${item.id === activeId ? on : off}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
