import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioMasterDetail } from "../server/types";
import { MasterDetailHeader } from "./master-detail-header";
import { MasterDetailKpis } from "./master-detail-kpis";
import { MasterDetailWeekSchedule } from "./master-detail-week-schedule";

const T = UI_TEXT.studioCabinet.mastersV2.detail;

/**
 * RES-28: общий примитив вместо руками собранной разметки.
 *
 * Кнопки нет намеренно: это пустой ВЫБОР, а не пустой список — действие
 * («выберите мастера») выполняется в списке слева, и подсказка про это и есть
 * `T.empty.hint`. Кнопка здесь вела бы в никуда.
 */
export function MasterDetailEmpty() {
  return (
    <EmptyState variant="card" icon={Users} title={T.empty.title} description={T.empty.hint} />
  );
}

export function MasterDetailPanel({
  studioId,
  detail,
}: {
  studioId: string;
  detail: StudioMasterDetail;
}) {
  return (
    <div className="space-y-4">
      <MasterDetailHeader studioId={studioId} detail={detail} />
      <MasterDetailKpis detail={detail} />
      <MasterDetailWeekSchedule cells={detail.weekSchedule} viewToken={detail.viewToken} />
    </div>
  );
}
