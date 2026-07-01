import type { ApplicationPhoto } from "@/lib/master/model-offers-view.service";
import { ResilientImage } from "@/components/ui/resilient-image";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.applicationCard;

type Props = {
  photos: ApplicationPhoto[];
};

/**
 * Compact photo strip (≤4 thumbnails) on each application card. URLs are
 * pre-signed token-delivery links built server-side. Lightbox is 29b
 * backlog — for now thumbnails are static. FIX-21: routed through the
 * resilient `<ResilientImage>` (fixed-size) so a dead token degrades to the
 * neutral placeholder instead of a broken-image icon.
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
          <ResilientImage
            key={photo.id}
            src={photo.url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-lg border border-border-subtle bg-bg-input object-cover"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
