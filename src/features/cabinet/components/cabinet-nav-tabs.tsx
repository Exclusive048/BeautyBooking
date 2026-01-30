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
  const base = "rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap";
  const on = "bg-black text-white";
  const off = "border hover:bg-neutral-50";

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
