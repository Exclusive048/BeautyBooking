import { StudioHero } from "@/features/public-studio/components/studio-hero";
import {
  getStudioPagePhotos,
  getStudioProfile,
  type StudioPagePhoto,
} from "@/features/public-studio/server/studio-query";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import { studioBookingUrl } from "@/lib/public-urls";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  studioId: string;
};

/**
 * Фото — дополнение к шапке: не прочитались — шапка показывает название,
 * описание и запись без карусели, а не «Не удалось загрузить раздел».
 */
async function loadHeroPhotos(studioId: string): Promise<StudioPagePhoto[]> {
  try {
    return await getStudioPagePhotos(studioId);
  } catch (error) {
    logPublicStudioBlockError("hero-photos", error, ["listMediaAssets"]);
    return [];
  }
}

export async function StudioHeroSection({ studioId }: Props) {
  let studio = null;
  let photos: StudioPagePhoto[] = [];
  // FIX-STUDIO-02 (owner parity): hide the hero booking CTA for the owner
  // (self-booking is server-rejected). Cached helper, resolves in parallel.
  let isOwner = false;
  let hasError = false;

  try {
    const result = await Promise.all([
      getStudioProfile(studioId),
      loadHeroPhotos(studioId),
      isViewerProfileOwner(studioId),
    ]);
    studio = result[0];
    photos = result[1];
    isOwner = result[2];
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("hero-section", error, ["getProviderProfile"]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
        {UI_TEXT.publicStudio.blockLoadFailed}
      </div>
    );
  }

  if (!studio) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
        {UI_TEXT.publicStudio.profileLoadFailed}
      </div>
    );
  }

  const bookingHref = studioBookingUrl(
    { id: studio.id, publicUsername: studio.publicUsername },
    undefined,
    "public-studio-hero"
  ) ?? "#";

  return (
    <div className="fade-in-up">
      <StudioHero studio={studio} photos={photos} bookingHref={bookingHref} hideBooking={isOwner} />
    </div>
  );
}
