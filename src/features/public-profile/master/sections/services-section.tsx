import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { ServicesSectionClient } from "@/features/public-profile/master/sections/services-section-client";

type Props = {
  providerId: string;
  initialServiceId: string | null;
};

export async function ServicesSection({ providerId, initialServiceId }: Props) {
  let provider = null;
  let hasError = false;

  try {
    provider = await getProvider(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-services", error, [`/api/providers/${providerId}`]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить услуги.
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <ServicesSectionClient services={provider.services} initialServiceId={initialServiceId} />
    </div>
  );
}
