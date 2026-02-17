import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { BookingSectionClient } from "@/features/public-profile/master/sections/booking-section-client";

type Props = {
  providerId: string;
  initialSlotStartAt: string | null;
};

export async function BookingSection({ providerId, initialSlotStartAt }: Props) {
  try {
    const provider = await getProvider(providerId);
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
  } catch {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }
}
