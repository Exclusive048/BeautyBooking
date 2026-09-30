import { Section } from "@/components/ui/section";
import { StudioServicesList } from "@/features/public-studio/studio-services-list";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioServicesSection({ studioId }: Props) {
  let studio = null;
  // FIX-STUDIO-02 (owner parity): hide per-service booking CTAs for the owner.
  let isOwner = false;
  let hasError = false;

  try {
    const [profile, owner] = await Promise.all([
      getStudioProfile(studioId),
      isViewerProfileOwner(studioId),
    ]);
    studio = profile;
    isOwner = owner;
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("services-section", error, ["getProviderProfile"]);
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
          {UI_TEXT.publicStudio.blockLoadFailed}
        </div>
      </Section>
    );
  }

  if (!studio) {
    return (
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
          {UI_TEXT.publicStudio.servicesLoadFailed}
        </div>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <StudioServicesList
          studio={{ id: studio.id, publicUsername: studio.publicUsername }}
          services={studio.services}
          hideBooking={isOwner}
        />
      </Section>
    </div>
  );
}
