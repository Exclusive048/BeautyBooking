import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
};

export function DatePicker({ value, onChange, min, max, disabled, className }: Props) {
  return (
    <Input
      type="date"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      className={cn("h-12 bg-surface", className)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
