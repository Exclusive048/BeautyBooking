import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
};

export function HeaderBlock({ title, subtitle, right, className }: Props) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-xl font-semibold text-text-main">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-text-sec">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
