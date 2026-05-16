import { Scissors } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.detail.empty;

export function ServiceDetailEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-12 text-center">
      <Scissors className="h-12 w-12 text-text-sec/30" aria-hidden />
      <p className="text-base font-semibold text-text-main">{T.title}</p>
      <p className="max-w-sm text-sm text-text-sec">{T.hint}</p>
    </div>
  );
}
