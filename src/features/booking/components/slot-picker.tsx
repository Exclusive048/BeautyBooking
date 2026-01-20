import { cn } from "@/lib/cn";

export function SlotPicker({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: Array<{ date: string; items: string[] }>;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("space-y-4", disabled && "opacity-50 pointer-events-none")}>
      {groups.map((g) => (
        <div key={g.date} className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">{g.date}</div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((t) => {
              const v = `${g.date} ${t}`;
              const active = value === v;
              return (
                <button
                  key={v}
                  onClick={() => onChange?.(v)}
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-sm transition",
                    active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
