/* eslint-disable @next/next/no-img-element */
import type { ApplicationPhoto } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.applicationCard;

type Props = {
  photos: ApplicationPhoto[];
};

/**
 * Compact photo strip (≤4 thumbnails) on each application card. URLs are
 * pre-signed token-delivery links built server-side. Lightbox is 29b
 * backlog — for now thumbnails are static. Uses raw `<img>` so the focal
 * crop is uniform; private-delivery already takes care of CDN sizing.
 */
export function ApplicationPhotos({ photos }: Props) {
  if (photos.length === 0) {
    return (
      <div className="flex h-16 items-center rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 text-xs text-text-sec">
        {T.photosEmpty}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.photosLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.slice(0, 4).map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt=""
            className="h-16 w-16 rounded-lg border border-border-subtle bg-bg-input object-cover"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
