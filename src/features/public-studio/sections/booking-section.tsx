import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";
import { studioBookingUrl } from "@/lib/public-urls";

type Props = {
  studioId: string;
  bookingParams?: { master?: string; masterId?: string; serviceId?: string; slotStartAt?: string };
};

export async function StudioBookingSection({ studioId, bookingParams }: Props) {
  let studio = null;
  let hasError = false;

  try {
    studio = await getStudioProfile(studioId);
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("booking-section", error, [`/api/providers/${studioId}`]);
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
        {UI_TEXT.publicStudio.bookingLoadFailed}
      </div>
    );
  }

  const bookingHref = studioBookingUrl(
    { id: studio.id, publicUsername: studio.publicUsername },
    {
      master: bookingParams?.master,
      masterId: bookingParams?.master ? undefined : bookingParams?.masterId,
      serviceId: bookingParams?.serviceId,
      slotStartAt: bookingParams?.slotStartAt,
    },
    "public-studio-booking"
  );

  return (
    <div className="fade-in-up" id="studio-booking-entry">
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-semibold text-text">{UI_TEXT.publicStudio.heroBook}</div>
          <Button asChild variant="secondary">
            <Link href={bookingHref ?? "#"}>{UI_TEXT.publicStudio.openBookingFlow}</Link>
          </Button>
        </div>
        <StudioBookingFlow
          studioId={studio.id}
          initialMasterId={bookingParams?.masterId}
          initialMasterKey={bookingParams?.master}
          initialServiceId={bookingParams?.serviceId}
        />
      </div>
    </div>
  );
}
