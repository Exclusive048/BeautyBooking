import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  rightSlot?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/** Shared visual frame for every settings panel. Header (title + desc +
 * optional right slot), body (children stack), optional footer aligned
 * to the right. */
export function SectionCard({ title, description, rightSlot, footer, children }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-text-main">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-text-sec">{description}</p>
          ) : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
      {footer ? (
        <div className="mt-5 flex items-center justify-end gap-3">{footer}</div>
      ) : null}
    </section>
  );
}
