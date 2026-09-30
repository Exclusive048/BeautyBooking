import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.cities.empty;

export function CitiesEmpty() {
  return <EmptyState icon={SearchX} title={T.title} description={T.hint} />;
}
