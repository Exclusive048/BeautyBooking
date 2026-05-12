import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile.sidebar;

type Props = {
  percent: number;
};

/**
 * Compact progress indicator at the top of the profile sidebar. Width
 * is the only state — colour stays brand-rose, the meter just fills.
 * Goes 0 → 100 across all 6 sections (see profile-completion.ts).
 */
export function CompletionCard({ percent }: Props) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.completionLabel}
        </p>
        <p className="font-display text-2xl text-text-main">{safe}%</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-input">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${safe}%` }}
        />
      </div>
    </section>
  );
}
