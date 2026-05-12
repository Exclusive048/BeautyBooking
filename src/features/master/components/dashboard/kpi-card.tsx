import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
};

/**
 * Single KPI tile — surface inside `<KpiCardsGrid>`. Numeric value uses
 * Playfair display + tabular-nums so multi-digit numbers don't shift the
 * row baseline. No trend % yet — sublabel carries plain-text context.
 */
export function KpiCard({ icon: Icon, label, value, sublabel }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4 lg:p-5">
      <div className="mb-3 flex items-start">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mb-1 text-xs text-text-sec">{label}</p>
      <p className="font-display text-2xl tabular-nums text-text-main lg:text-[28px]">
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-[11px] text-text-sec">{sublabel}</p>
      ) : null}
    </div>
  );
}
