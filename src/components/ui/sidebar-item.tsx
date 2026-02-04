import Link from "next/link";
import { cn } from "@/lib/cn";

type Props = {
  href: string;
  label: string;
  active?: boolean;
  className?: string;
};

export function SidebarItem({ href, label, active = false, className }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-xl px-3 py-2 text-sm transition-all duration-300",
        active
          ? "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
          : "text-text-sec hover:bg-bg-input hover:text-text-main",
        className
      )}
    >
      {label}
    </Link>
  );
}
