import { SearchX } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.cities.empty;

export function CitiesEmpty() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <SearchX className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
      <p className="mb-1 font-display text-base text-text-main">{T.title}</p>
      <p className="max-w-xs text-sm text-text-sec">{T.hint}</p>
    </div>
  );
}
