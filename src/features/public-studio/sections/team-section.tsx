import { Section } from "@/components/ui/section";
import { StudioMastersCarousel } from "@/features/public-studio/studio-masters-carousel";
import { getStudioMasters, getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";

type Props = {
  studioId: string;
};

export async function StudioTeamSection({ studioId }: Props) {
  let masters: StudioMaster[] = [];
  let studio: { id: string; publicUsername: string | null } | null = null;
  let hasError = false;

  try {
    const [mastersResult, studioProfile] = await Promise.all([
      getStudioMasters(studioId),
      getStudioProfile(studioId),
    ]);
    masters = mastersResult;
    studio = studioProfile ? { id: studioProfile.id, publicUsername: studioProfile.publicUsername } : null;
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("team-section", error, [
      `/api/providers/${studioId}`,
      `/api/providers/${studioId}/masters`,
    ]);
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.teamTitle} subtitle={UI_TEXT.publicStudio.teamSubtitle}>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
          {UI_TEXT.publicStudio.blockLoadFailed}
        </div>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.teamTitle} subtitle={UI_TEXT.publicStudio.teamSubtitle}>
        <StudioMastersCarousel
          studio={studio ?? { id: studioId, publicUsername: null }}
          masters={masters}
        />
      </Section>
    </div>
  );
}
