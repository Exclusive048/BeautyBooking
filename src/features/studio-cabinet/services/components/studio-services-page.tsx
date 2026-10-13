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
import { StackedDetailAnchor } from "../../components/stacked-detail-anchor";
import { CategoriesSidebar } from "./categories-sidebar";
import { PackagesSection } from "./packages-section";
import { ServiceDetailEmpty } from "./service-detail-empty";
import { ServiceDetailPanel } from "./service-detail-panel";
import { ServicesHeader } from "./services-header";
import { ServicesKpiRow } from "./services-kpi-row";
import { ServicesList } from "./services-list";

// UX-PASS-01: ниже xl панель деталей стоит под списком.
const STACKED_DETAIL_QUERY = "(max-width: 1279.98px)";

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

      {/* UX-PASS-01: три колонки 240 + список + 420 при ширине контента
          ~700–960px (сайдбар кабинета занимает 256px) сжимали список до
          нечитаемой полосы. Три колонки — только с xl (уже: 220 / 380),
          исходные 240 / 420 — с 2xl; на lg детали встают под список, а
          категории тянутся на обе строки. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_380px] 2xl:grid-cols-[240px_minmax(0,1fr)_420px]">
        <div className="min-w-0 lg:row-span-2 xl:row-span-1">
          <CategoriesSidebar
            studioId={studioId}
            categories={categories}
            selectedCategoryId={selectedCategoryId}
          />
        </div>
        <div data-guide="assign" className="min-w-0 rounded-2xl">
          <ServicesList
            items={items}
            selectedServiceId={detail?.id ?? null}
            search={search}
            selectedCategory={selectedCategory}
          />
        </div>
        <StackedDetailAnchor
          selectionKey={detail?.id ?? null}
          stackedQuery={STACKED_DETAIL_QUERY}
          className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1"
        >
          {detail ? (
            <ServiceDetailPanel
              studioId={studioId}
              detail={detail}
              pickerOptions={pickerOptions}
            />
          ) : (
            <ServiceDetailEmpty />
          )}
        </StackedDetailAnchor>
      </div>

      <PackagesSection
        studioId={studioId}
        packages={packages}
        pickerServices={packagePickerServices}
      />
    </div>
  );
}
