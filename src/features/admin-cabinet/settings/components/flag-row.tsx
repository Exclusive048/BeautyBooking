"use client";

import { Switch } from "@/components/ui/switch";

type Props = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function FlagRow({ label, description, checked, onChange, disabled }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border-subtle/60 py-3 first:border-t-0 first:pt-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-main">{label}</div>
        <div className="mt-0.5 text-xs text-text-sec">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
