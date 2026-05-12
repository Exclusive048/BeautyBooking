import { MapPin } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile.location;

type Props = {
  geoLat: number | null;
  geoLng: number | null;
};

/**
 * Yandex Maps iframe embed. The widget endpoint (`/map-widget/v1/`) is
 * unauthenticated and respects `pt=lng,lat,pmrdm` for a red pin. Falls
 * back to a friendly empty card when coords are missing — that's the
 * usual "address didn't geocode" state.
 */
export function MapDisplay({ geoLat, geoLng }: Props) {
  if (geoLat === null || geoLng === null) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-10 text-center">
        <MapPin className="mb-2 h-8 w-8 text-text-sec/40" aria-hidden />
        <p className="font-display text-sm text-text-main">{T.mapMissingTitle}</p>
        <p className="mt-1 text-xs text-text-sec">{T.mapMissingBody}</p>
      </div>
    );
  }

  const url = `https://yandex.ru/map-widget/v1/?ll=${geoLng}%2C${geoLat}&z=16&pt=${geoLng},${geoLat},pm2rdm`;
  return (
    <div className="h-56 overflow-hidden rounded-xl border border-border-subtle bg-bg-input">
      <iframe
        src={url}
        title="Yandex Map"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-full w-full"
      />
    </div>
  );
}
