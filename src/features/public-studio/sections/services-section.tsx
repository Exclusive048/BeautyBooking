import { Section } from "@/components/ui/section";
import { StudioServicesList } from "@/features/public-studio/studio-services-list";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioServicesSection({ studioId }: Props) {
  let studio = null;
  let hasError = false;

  try {
    studio = await getStudioProfile(studioId);
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("services-section", error, [`/api/providers/${studioId}`]);
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
          {UI_TEXT.publicStudio.blockLoadFailed}
        </div>
      </Section>
    );
  }

  if (!studio) {
    return (
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
          {UI_TEXT.publicStudio.servicesLoadFailed}
        </div>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <StudioServicesList
          studio={{ id: studio.id, publicUsername: studio.publicUsername }}
          categories={studio.categories}
          services={studio.services}
        />
      </Section>
    </div>
  );
}
