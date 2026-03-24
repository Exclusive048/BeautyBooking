import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { BookingSectionClient } from "@/features/public-profile/master/sections/booking-section-client";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
  initialSlotStartAt: string | null;
};

export async function BookingSection({ providerId, initialSlotStartAt }: Props) {
  let provider = null;
  let studioPublicUsername: string | null = null;
  let hasError = false;

  try {
    provider = await getProvider(providerId);
    if (provider?.studioId) {
      const studio = await resolveProviderBySlugOrId({
        key: provider.studioId,
        select: { id: true, publicUsername: true },
      });
      studioPublicUsername = studio?.publicUsername ?? null;
    }
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-booking", error, [`/api/providers/${providerId}`]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.bookingLoadFailed}
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <BookingSectionClient
        provider={provider}
        initialSlotStartAt={initialSlotStartAt}
        studioPublicUsername={studioPublicUsername}
      />
    </div>
  );
}
