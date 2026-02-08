import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function ListRow({ title, subtitle, icon, right, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card/80 p-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input text-sm text-text-main">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-xs text-text-sec">{subtitle}</div> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
