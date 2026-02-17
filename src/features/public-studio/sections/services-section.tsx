import { Section } from "@/components/ui/section";
import { StudioServicesList } from "@/features/public-studio/studio-services-list";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioServicesSection({ studioId }: Props) {
  try {
    const studio = await getStudioProfile(studioId);
    if (!studio) {
      return (
        <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
          <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
            Не удалось загрузить услуги.
          </div>
        </Section>
      );
    }

    return (
      <div className="fade-in-up">
        <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
          <StudioServicesList
            studioId={studio.id}
            categories={studio.categories}
            services={studio.services}
          />
        </Section>
      </div>
    );
  } catch {
    return (
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
          Не удалось загрузить блок.
        </div>
      </Section>
    );
  }
}
