import { cn } from "@/lib/cn";

type Props = {
  text: string;
  className?: string;
};

export function TooltipHint({ text, className }: Props) {
  return (
    <span
      title={text}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle bg-bg-input text-[10px] font-semibold text-text-sec",
        className
      )}
      aria-label={text}
    >
      ?
    </span>
  );
}
