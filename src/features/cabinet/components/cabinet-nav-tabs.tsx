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
  const base = "rounded-xl px-3 py-2 text-sm font-medium";
  const on = "bg-black text-white";
  const off = "border hover:bg-neutral-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
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
