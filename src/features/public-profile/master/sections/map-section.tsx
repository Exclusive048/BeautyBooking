import { ArrowUpRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMasterPublicProfileView } from "@/lib/master/public-profile-view.service";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
};

const T = UI_TEXT.publicProfile.map;

export async function MapSection({ providerId }: Props) {
  let view = null;
  let hasError = false;

  try {
    view = await getMasterPublicProfileView(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-map", error, [`/api/providers/${providerId}`]);
  }

  if (hasError || !view) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }

  const { provider } = view;
  if (!provider.address && provider.geoLat === null && provider.geoLng === null) {
    return null;
  }

  const mapsHref = buildYandexMapsUrl({
    address: provider.address,
    lat: provider.geoLat,
    lon: provider.geoLng,
  });

  return (
    <section>
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-text-sec">
          {T.eyebrow}
        </div>
        <h2 className="font-display text-lg text-text-main">{T.heading}</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
        <div
          aria-hidden
          className="aurora-bg relative h-[200px] w-full md:h-[240px]"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-brand-gradient flex h-12 w-12 items-center justify-center rounded-full text-white shadow-brand">
              <MapPin className="h-5 w-5" aria-hidden strokeWidth={1.8} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-main">
              {provider.address || T.noAddress}
            </div>
            {provider.district ? (
              <div className="mt-0.5 text-xs text-text-sec">{provider.district}</div>
            ) : null}
          </div>
          {mapsHref ? (
            <Button asChild variant="secondary" size="sm" className="gap-1.5">
              <a href={mapsHref} target="_blank" rel="noreferrer">
                {T.directions}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden strokeWidth={1.6} />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
