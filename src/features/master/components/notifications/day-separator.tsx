type Props = {
  label: string;
  count: number;
};

/**
 * Day-grouping divider used between buckets in the notifications feed.
 * Visually a small uppercase eyebrow + count + thin horizontal rule.
 */
export function DaySeparator({ label, count }: Props) {
  return (
    <div className="flex items-center gap-3 text-xs text-text-sec">
      <span className="font-mono uppercase tracking-[0.18em]">{label}</span>
      <span className="font-mono" aria-hidden>
        ·
      </span>
      <span className="font-mono">{count}</span>
      <div className="h-px flex-1 bg-border-subtle" aria-hidden />
    </div>
  );
}
