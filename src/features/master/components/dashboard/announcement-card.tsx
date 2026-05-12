import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AnnouncementItem } from "@/features/master/lib/announcements";

const ACCENT_BORDER: Record<AnnouncementItem["type"], string> = {
  tip: "border-l-primary",
  announce: "border-l-emerald-500",
  training: "border-l-blue-500",
};

type Props = {
  item: AnnouncementItem;
};

/**
 * Single announcement card with a coloured left accent that signals the
 * type at a glance. CTA is a chevron; whole card is clickable when `href`
 * is provided.
 */
export function AnnouncementCard({ item }: Props) {
  const accent = ACCENT_BORDER[item.type];
  const inner = (
    <div
      className={cn(
        "rounded-xl border border-border-subtle border-l-[3px] bg-bg-page px-4 py-3",
        accent,
      )}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-text-sec">
        {item.label}
      </p>
      <p className="mt-1 text-sm font-medium text-text-main">{item.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-text-sec">{item.description}</p>
    </div>
  );

  if (!item.href) return inner;
  return (
    <Link
      href={item.href}
      className="group block transition-opacity hover:opacity-90"
    >
      <div
        className={cn(
          "relative rounded-xl border border-border-subtle border-l-[3px] bg-bg-page px-4 py-3",
          accent,
        )}
      >
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-text-sec">
          {item.label}
        </p>
        <p className="mt-1 text-sm font-medium text-text-main">{item.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-sec">{item.description}</p>
        <ArrowRight
          aria-hidden
          className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-sec opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </Link>
  );
}
