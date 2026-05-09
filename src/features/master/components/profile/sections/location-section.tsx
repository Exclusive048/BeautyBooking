import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MasterProfileViewData } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { AddressEditor } from "../editable/address-editor";
import { EditableFieldRow } from "../editable/editable-field-row";
import { SectionShell } from "./section-shell";
import { MapDisplay } from "./map-display";

const T = UI_TEXT.cabinetMaster.profile.location;

type Props = {
  data: MasterProfileViewData["location"];
};

export function LocationSection({ data }: Props) {
  const isCityEmpty = !data.cityName || data.cityName.trim().length === 0;
  return (
    <SectionShell anchor="location" icon={MapPin} title={T.title} subtitle={T.subtitle}>
      <div className="divide-y divide-border-subtle">
        <CityRow value={data.cityName} isEmpty={isCityEmpty} />
        <EditableFieldRow
          label={T.districtLabel}
          value={data.district ?? ""}
          fieldKey="district"
          placeholder={T.districtPlaceholder}
          maxLength={120}
        />
        <AddressEditor value={data.address ?? ""} />
      </div>
      <div className="mt-4">
        <MapDisplay geoLat={data.geoLat} geoLng={data.geoLng} />
      </div>
    </SectionShell>
  );
}

function CityRow({ value, isEmpty }: { value: string | null; isEmpty: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.cityLabel}
          </p>
          <span className="font-mono text-[10px] text-text-sec">· {T.cityAutoHint}</span>
        </div>
        <p
          className={cn(
            "mt-1 text-sm",
            isEmpty ? "italic text-text-sec" : "text-text-main"
          )}
        >
          {isEmpty ? T.cityNotSet : value}
        </p>
      </div>
    </div>
  );
}
