import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type TaskUrgency = "high" | "medium";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Trailing action — `<Link>` button OR a client island. */
  cta: ReactNode;
  urgency: TaskUrgency;
};

/**
 * One row inside the "Требуют внимания" panel. Server-renderable, the
 * trailing action slot accepts either a server-rendered Link or a
 * client island (e.g. inline confirm/decline) — keeps the row
 * presentation-only.
 */
export function TaskRow({ icon: Icon, title, description, cta, urgency }: Props) {
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
      <div className="shrink-0">{cta}</div>
    </div>
  );
}
