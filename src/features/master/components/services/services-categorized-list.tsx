import type {
  MasterServicesViewData,
  ServiceCategoryOption,
  ServicePackageView,
  ServicesByCategory,
} from "@/lib/master/services-view.service";
import { BundlesAccordion } from "./bundles-accordion";
import { CategoryAccordion } from "./category-accordion";

type Props = {
  categorizedServices: ServicesByCategory[];
  bundles: ServicePackageView[];
  allServices: MasterServicesViewData["allServicesFlat"];
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
};

/**
 * Composes the per-category service accordions and the bundles
 * accordion into one stack. Empty buckets are dropped — the page-level
 * filter (`?filter=`) decides what gets through to this list.
 */
export function ServicesCategorizedList({
  categorizedServices,
  bundles,
  allServices,
  categories,
  onlinePaymentsAvailable,
}: Props) {
  return (
    <div className="space-y-3">
      {categorizedServices.map((category) => (
        <CategoryAccordion
          key={category.id ?? "uncategorised"}
          category={category}
          categories={categories}
          onlinePaymentsAvailable={onlinePaymentsAvailable}
        />
      ))}
      <BundlesAccordion bundles={bundles} allServices={allServices} />
    </div>
  );
}
