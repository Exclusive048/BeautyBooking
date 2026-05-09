import { ChevronRight } from "lucide-react";
import type {
  ServiceCategoryOption,
  ServicesByCategory,
} from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ServiceRow } from "./service-row";

const T = UI_TEXT.cabinetMaster.servicesPage.categoryAccordion;

type Props = {
  category: ServicesByCategory;
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
};

/** Native `<details>` accordion — same convention as 31a profile mini. */
export function CategoryAccordion({ category, categories, onlinePaymentsAvailable }: Props) {
  return (
    <details open className="group rounded-2xl border border-border-subtle bg-bg-card/40 overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-bg-input/50">
        <ChevronRight
          className="h-4 w-4 text-text-sec transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="flex-1 font-display text-base text-text-main">
          {category.name || T.uncategorisedName}
        </span>
        <span className="font-mono text-xs text-text-sec">{category.services.length}</span>
      </summary>
      <ul className="space-y-1.5 px-3 pb-3 pt-1.5">
        {category.services.map((service) => (
          <li key={service.id}>
            <ServiceRow
              service={service}
              categories={categories}
              onlinePaymentsAvailable={onlinePaymentsAvailable}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
