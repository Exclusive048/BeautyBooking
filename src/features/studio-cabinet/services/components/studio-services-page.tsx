import type {
  StudioCategoryPickerOption,
  StudioServiceCategoryRow,
  StudioServiceDetail,
  StudioServiceListItem,
  StudioServicesKpis,
} from "../lib/types";
import type {
  StudioPackagePickerService,
  StudioPackageView,
} from "../server/packages-data.service";
import { CategoriesSidebar } from "./categories-sidebar";
import { PackagesSection } from "./packages-section";
import { ServiceDetailEmpty } from "./service-detail-empty";
import { ServiceDetailPanel } from "./service-detail-panel";
import { ServicesHeader } from "./services-header";
import { ServicesKpiRow } from "./services-kpi-row";
import { ServicesList } from "./services-list";

type Props = {
  studioId: string;
  categories: StudioServiceCategoryRow[];
  pickerOptions: StudioCategoryPickerOption[];
  selectedCategoryId: string | null;
  items: StudioServiceListItem[];
  search: string;
  detail: StudioServiceDetail | null;
  kpis: StudioServicesKpis;
  packages: StudioPackageView[];
  packagePickerServices: StudioPackagePickerService[];
};

export function StudioServicesPage({
  studioId,
  categories,
  pickerOptions,
  selectedCategoryId,
  items,
  search,
  detail,
  kpis,
  packages,
  packagePickerServices,
}: Props) {
  const selectedCategory =
    categories.find((c) => c.id === selectedCategoryId) ?? null;

  return (
    <div className="space-y-5 lg:space-y-6">
      <ServicesHeader
        studioId={studioId}
        servicesCount={kpis.totalServices}
        categoriesCount={kpis.totalCategories}
        pickerOptions={pickerOptions}
      />
      <ServicesKpiRow kpis={kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_420px]">
        <CategoriesSidebar
          studioId={studioId}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
        />
        <div data-guide="assign" className="min-w-0 rounded-2xl">
          <ServicesList
            items={items}
            selectedServiceId={detail?.id ?? null}
            search={search}
            selectedCategory={selectedCategory}
          />
        </div>
        <div className="min-w-0">
          {detail ? (
            <ServiceDetailPanel
              studioId={studioId}
              detail={detail}
              pickerOptions={pickerOptions}
            />
          ) : (
            <ServiceDetailEmpty />
          )}
        </div>
      </div>

      <PackagesSection
        studioId={studioId}
        packages={packages}
        pickerServices={packagePickerServices}
      />
    </div>
  );
}
