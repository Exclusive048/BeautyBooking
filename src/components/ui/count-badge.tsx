import { cn } from "@/lib/cn";

type CountBadgeProps = {
  count: number;
  /** Больше — показывается «{max}+». */
  max?: number;
  /** Положение над иконкой (`absolute right-2 top-2`) — у вызывающего. */
  className?: string;
};

/**
 * Счётчик в кружке над пунктом нижней навигации (29.09 доработки · 25, UI-22):
 * одна форма на три навигации — общую, мастера и студии. Число дублирует
 * доступное имя пункта, поэтому кружок скрыт от чтения с экрана.
 */
export function CountBadge({ count, max = 99, className }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold leading-none tabular-nums text-primary-foreground",
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
