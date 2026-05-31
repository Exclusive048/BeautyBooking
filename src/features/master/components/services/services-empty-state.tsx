import { Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { ServiceCategoryOption } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AddServiceButton } from "./add-service-button";

const T = UI_TEXT.cabinetMaster.servicesPage.empty;

type Props = {
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
};

/**
 * The action slot is a custom `<AddServiceButton>` (manages its own modal +
 * variant logic), so it lives as children rather than as `action={...}`.
 */
export function ServicesEmptyState({ categories, onlinePaymentsAvailable }: Props) {
  return (
    <EmptyState
      variant="card"
      iconSize="lg"
      icon={Layers}
      title={T.title}
      description={T.body}
    >
      <div className="mt-5 flex justify-center">
        <AddServiceButton
          categories={categories}
          onlinePaymentsAvailable={onlinePaymentsAvailable}
          variant="empty"
        />
      </div>
    </EmptyState>
  );
}
