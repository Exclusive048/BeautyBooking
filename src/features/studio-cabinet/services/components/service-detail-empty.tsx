import { Scissors } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.detail.empty;

export function ServiceDetailEmpty() {
  return (
    <EmptyState
      variant="card"
      icon={Scissors}
      title={T.title}
      description={T.hint}
    />
  );
}
