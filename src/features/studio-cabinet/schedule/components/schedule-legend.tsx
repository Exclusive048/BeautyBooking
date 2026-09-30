import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleV2.legend;

const ITEMS: Array<{ key: keyof typeof T; class: string }> = [
  {
    key: "confirmed",
    class: "bg-primary/40 border border-primary/60",
  },
  {
    key: "pending",
    class: "bg-warning border border-warning",
  },
  {
    key: "newClient",
    class: "bg-success border border-success",
  },
  {
    key: "break",
    class: "bg-bg-input border border-dashed border-border-subtle",
  },
];

export function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-bg-card px-3 py-2 text-xs text-text-sec">
      {ITEMS.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-2.5 w-2.5 rounded ${item.class}`}
          />
          {T[item.key]}
        </span>
      ))}
    </div>
  );
}
