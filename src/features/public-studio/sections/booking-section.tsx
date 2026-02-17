import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioBookingSection({ studioId }: Props) {
  let studio = null;
  let hasError = false;

  try {
    studio = await getStudioProfile(studioId);
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
        Не удалось загрузить блок.
      </div>
    );
  }

  if (!studio) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
        Не удалось загрузить запись.
      </div>
    );
  }

  return (
    <div className="fade-in-up" id="studio-booking-entry">
      <div className="rounded-2xl border border-border bg-surface p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-semibold text-text">{UI_TEXT.publicStudio.heroBook}</div>
          <Button asChild variant="secondary">
            <Link href={`/studios/${studio.id}/booking`}>{UI_TEXT.publicStudio.openBookingFlow}</Link>
          </Button>
        </div>
        <StudioBookingFlow studioId={studio.id} />
      </div>
    </div>
  );
}
