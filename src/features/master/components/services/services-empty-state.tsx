import { Layers } from "lucide-react";
import type { ServiceCategoryOption } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AddServiceButton } from "./add-service-button";

const T = UI_TEXT.cabinetMaster.servicesPage.empty;

type Props = {
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
};

export function ServicesEmptyState({ categories, onlinePaymentsAvailable }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-input">
        <Layers className="h-6 w-6 text-text-sec/60" aria-hidden />
      </div>
      <h3 className="font-display text-lg text-text-main">{T.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-sec">{T.body}</p>
      <div className="mt-5 flex justify-center">
        <AddServiceButton
          categories={categories}
          onlinePaymentsAvailable={onlinePaymentsAvailable}
          variant="empty"
        />
      </div>
    </div>
  );
}
