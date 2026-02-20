import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { BookingSectionClient } from "@/features/public-profile/master/sections/booking-section-client";

type Props = {
  providerId: string;
  initialSlotStartAt: string | null;
};

export async function BookingSection({ providerId, initialSlotStartAt }: Props) {
  let provider = null;
  let hasError = false;

  try {
    provider = await getProvider(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-booking", error, [`/api/providers/${providerId}`]);
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
        Не удалось загрузить запись.
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <BookingSectionClient provider={provider} initialSlotStartAt={initialSlotStartAt} />
    </div>
  );
}
