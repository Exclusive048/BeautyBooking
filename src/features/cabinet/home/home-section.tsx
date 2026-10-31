import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  subtitle?: string;
  /** Справа от заголовка: бейдж, ссылка. */
  aside?: ReactNode;
  id?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
};

/** Рамка секции нижней части главной кабинетов (AI-CABINET-ANALYSIS). */
export function HomeSection({ title, subtitle, aside, id, testId, className, children }: Props) {
  return (
    <section
      id={id}
      data-testid={testId}
      className={cn("scroll-mt-24 rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-5", className)}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-text-sec">{subtitle}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
