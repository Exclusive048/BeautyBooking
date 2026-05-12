import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  /** Anchor id without the `profile-` prefix; the component prepends it. */
  anchor: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Right-aligned slot — usually the "Manage" link on read-only sections. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Shared frame for the six profile sections — keeps headings, paddings,
 * and `scroll-mt-24` consistent so the SectionNav anchor jumps land just
 * below the sticky page header.
 */
export function SectionShell({ anchor, icon: Icon, title, subtitle, actions, children }: Props) {
  return (
    <section
      id={`profile-${anchor}`}
      className="scroll-mt-24 rounded-2xl border border-border-subtle bg-bg-card p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base text-text-main">
            <Icon className="h-4 w-4 text-text-sec" aria-hidden />
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-text-sec">{subtitle}</p>
          ) : null}
        </div>
        {actions ?? null}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}
