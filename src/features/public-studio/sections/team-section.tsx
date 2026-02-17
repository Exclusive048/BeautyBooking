import { Section } from "@/components/ui/section";
import { StudioMastersCarousel } from "@/features/public-studio/studio-masters-carousel";
import { getStudioMasters } from "@/features/public-studio/server/studio-query";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioTeamSection({ studioId }: Props) {
  try {
    const masters = await getStudioMasters(studioId);
    return (
      <div className="fade-in-up">
        <Section title={UI_TEXT.publicStudio.teamTitle} subtitle={UI_TEXT.publicStudio.teamSubtitle}>
          <StudioMastersCarousel studioId={studioId} masters={masters} />
        </Section>
      </div>
    );
  } catch {
    return (
      <Section title={UI_TEXT.publicStudio.teamTitle} subtitle={UI_TEXT.publicStudio.teamSubtitle}>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
          Не удалось загрузить блок.
        </div>
      </Section>
    );
  }
}
