import { ReportsFilters } from "@/features/admin-cabinet/reports/components/reports-filters";
import { ReportsHeader } from "@/features/admin-cabinet/reports/components/reports-header";
import { ReportsList } from "@/features/admin-cabinet/reports/components/reports-list";
import type {
  AdminReportRow,
  AdminReportStatusTab,
  AdminReportTypeFilter,
  AdminReportsCounts,
} from "@/features/admin-cabinet/reports/types";

type Props = {
  counts: AdminReportsCounts;
  rows: AdminReportRow[];
  nextCursor: string | null;
  filters: {
    status: AdminReportStatusTab;
    type: AdminReportTypeFilter;
  };
};

/** Серверная сборка `/admin/reports`: подпись и срок ответа → вкладки и тип → карточки. */
export function AdminReports({ counts, rows, nextCursor, filters }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <ReportsHeader counts={counts} />
      <ReportsFilters status={filters.status} type={filters.type} counts={counts} />
      <ReportsList
        // Новый набор фильтров — новый список: локальные правки прежнего не переносятся.
        key={`${filters.status}:${filters.type}`}
        rows={rows}
        nextCursor={nextCursor}
        status={filters.status}
      />
    </div>
  );
}
