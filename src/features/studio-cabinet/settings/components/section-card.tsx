import { cn } from "@/lib/cn";

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Render the card with a red accent — used by the danger zone. */
  danger?: boolean;
};

export function SectionCard({ title, description, children, danger }: Props) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-bg-card p-4 md:p-5",
        danger ? "border-rose-300/50 dark:border-rose-800/50" : "border-border-subtle",
      )}
    >
      <header className="mb-3">
        <h3 className={cn("font-display text-base font-semibold", danger ? "text-rose-700 dark:text-rose-400" : "text-text-main")}>
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-sm text-text-sec">{description}</p>
        ) : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
