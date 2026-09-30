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
        danger ? "border-danger-border" : "border-border-subtle",
      )}
    >
      <header className="mb-3">
        <h3 className={cn("font-display text-base font-semibold", danger ? "text-danger-text" : "text-text-main")}>
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
