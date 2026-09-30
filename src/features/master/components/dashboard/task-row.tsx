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
  /** FIX-R2-06-B: deep-link focus anchor (e.g. the pending booking id). */
  focusId?: string;
};

/**
 * One row inside the "Требуют внимания" panel. Server-renderable, the
 * trailing action slot accepts either a server-rendered Link or a
 * client island (e.g. inline confirm/decline) — keeps the row
 * presentation-only.
 */
export function TaskRow({ icon: Icon, title, description, cta, urgency, focusId }: Props) {
  const iconColor =
    urgency === "high"
      ? "bg-warning/10 text-warning-text"
      : "bg-primary/10 text-accent-text";

  return (
    <div data-focus-id={focusId} className="flex items-start gap-3 px-4 py-3.5">
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
