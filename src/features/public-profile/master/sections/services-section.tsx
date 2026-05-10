import { getMasterPublicProfileView } from "@/lib/master/public-profile-view.service";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { ServicesSectionClient } from "@/features/public-profile/master/sections/services-section-client";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
  initialServiceId: string | null;
};

export async function ServicesSection({ providerId, initialServiceId }: Props) {
  let view = null;
  let hasError = false;

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
      />
    </div>
  );
}
