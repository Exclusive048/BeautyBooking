import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  description?: string;
  preview: ReactNode;
  actions?: ReactNode;
  gallery?: ReactNode;
  className?: string;
};

export function UploaderSurface({
  title,
  description,
  preview,
  actions,
  gallery,
  className,
}: Props) {
  return (
    <section className={cn("lux-card rounded-[24px] p-4", className)}>
      <h3 className="text-sm font-semibold text-text-main">{title}</h3>
      {description ? <p className="mt-1 text-xs text-text-sec">{description}</p> : null}
      <div className="mt-3 rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
        {preview}
      </div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      {gallery ? <div className="mt-3">{gallery}</div> : null}
    </section>
  );
}
