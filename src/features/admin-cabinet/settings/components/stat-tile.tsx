import { cn } from "@/lib/cn";

type Tone = "neutral" | "warning" | "danger";

type Props = {
  label: string;
  value: number | string;
  tone?: Tone;
};

const toneClasses: Record<Tone, string> = {
  neutral: "text-text-main",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

export function StatTile({ label, value, tone = "neutral" }: Props) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-input/50 px-4 py-4 text-center">
      <div
        className={cn(
          "font-display text-2xl font-bold tabular-nums leading-none tracking-tight",
          toneClasses[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-text-sec">{label}</div>
    </div>
  );
}
