import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TaskUrgency = "high" | "medium";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  urgency: TaskUrgency;
};

/**
 * One row inside the "Требуют внимания" panel. Server-renderable — every
 * action goes to a Link href, so no client interactivity needed at the
 * row level.
 */
export function TaskRow({ icon: Icon, title, description, ctaLabel, ctaHref, urgency }: Props) {
  const iconColor =
    urgency === "high"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-primary/10 text-primary";

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconColor}`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-main">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-sec">{description}</p>
      </div>
      <Button asChild variant="secondary" size="sm" className="shrink-0">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
