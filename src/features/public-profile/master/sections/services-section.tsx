import { getMasterPublicProfileView } from "@/lib/master/public-profile-view.service";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import { ServicesSectionClient } from "@/features/public-profile/master/sections/services-section-client";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
  initialServiceId: string | null;
};

export async function ServicesSection({ providerId, initialServiceId }: Props) {
  let view = null;
  let hasError = false;
  // FIX-MASTER-01 item 5: the owner must not be offered the package-booking
  // CTA either — /book would hit the same self-booking server guard the
  // hidden main widget would. `cache()` dedupes with the page-level call.
  const isOwner = await isViewerProfileOwner(providerId);

  try {
    view = await getMasterPublicProfileView(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-services", error, [`/api/providers/${providerId}`]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }
  if (!view) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.servicesLoadFailed}
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <ServicesSectionClient
        services={view.provider.services}
        bundles={view.bundles}
        initialServiceId={initialServiceId}
        providerId={view.provider.id}
        providerTimezone={view.provider.timezone}
        providerBufferMin={view.providerBufferMin}
        // PACKAGE-BOOKING-MVP-1: solo master only (studio masters book via
        // the studio flow). Gates the "Записаться на пакет" CTA. Owner view
        // suppresses it too (self-booking is server-rejected).
        packageBookable={view.provider.type === "MASTER" && !view.provider.studioId && !isOwner}
      />
    </div>
  );
}
