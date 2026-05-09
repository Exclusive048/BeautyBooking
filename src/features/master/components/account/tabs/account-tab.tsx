import type { MasterAccountViewData } from "@/lib/master/account-view.service";
import { DangerZoneCard } from "../account/danger-zone-card";
import { ExportCard } from "../account/export-card";
import { PlanCard } from "../account/plan-card";
import { RolesCard } from "../account/roles-card";

type Props = {
  data: MasterAccountViewData;
};

export function AccountTab({ data }: Props) {
  return (
    <div className="space-y-4">
      <PlanCard plan={data.plan} />
      <RolesCard roles={data.roles} />
      <ExportCard />
      <DangerZoneCard phone={data.identity.phone} />
    </div>
  );
}
