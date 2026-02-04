"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  ratingLabel: string;
  studioName?: string | null;
};

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/cabinet/master/dashboard", label: "Главная" },
  { href: "/cabinet/master/schedule", label: "Мой график" },
  { href: "/cabinet/master/profile", label: "Профиль" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MasterCabinetTopbar({ ratingLabel, studioName }: Props) {
  const pathname = usePathname();

  return (
    <header className="rounded-2xl border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold">
            BeautyHub
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-black bg-black text-white"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/cabinet/master/reviews"
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                isActive(pathname, "/cabinet/master/reviews")
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              Отзывы {ratingLabel}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm text-neutral-700">
          {studioName ? <span className="rounded-lg border px-3 py-1.5">{studioName}</span> : null}
        </div>
      </div>
    </header>
  );
}
