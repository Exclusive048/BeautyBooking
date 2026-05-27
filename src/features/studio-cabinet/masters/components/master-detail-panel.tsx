import { Users } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMasterDetail } from "../server/types";
import { MasterDetailHeader } from "./master-detail-header";
import { MasterDetailKpis } from "./master-detail-kpis";
import { MasterDetailWeekSchedule } from "./master-detail-week-schedule";

const T = UI_TEXT.studioCabinet.mastersV2.detail;

export function MasterDetailEmpty() {
  return (
    <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-12 text-center">
      <Users className="h-12 w-12 text-text-sec/30" aria-hidden />
      <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
      <p className="max-w-sm text-sm text-text-sec">{T.empty.hint}</p>
    </section>
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
