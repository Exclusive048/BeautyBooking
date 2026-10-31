import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  right?: ReactNode;
  className?: string;
};

export function HeaderBlock({ title, right, className }: Props) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-xl font-semibold text-text-main">{title}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
