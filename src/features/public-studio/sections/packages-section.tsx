import { Section } from "@/components/ui/section";
import { StudioBundleCard } from "@/features/public-studio/components/studio-bundle-card";
import { getStudioProfile, getStudioMasters } from "@/features/public-studio/server/studio-query";
import { getStudioBundles } from "@/features/public-studio/server/studio-packages.service";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

/**
 * PACKAGE-BOOKING-MVP-2 — surfaces the studio's service packages on the public
 * profile with a "Записаться на пакет" CTA (closes R2-04-PKG, parity with the
 * solo master profile). Renders nothing when the studio has no bookable
 * packages, so it's invisible for studios that don't use them.
 */
export async function StudioPackagesSection({ studioId }: Props) {
  let studioProviderId: string | null = null;
  let studioTimezone = "Europe/Moscow";

  try {
    const studio = await getStudioProfile(studioId);
    if (!studio || studio.type !== "STUDIO") return null;
    studioProviderId = studio.id;
    studioTimezone = studio.timezone;
  } catch (error) {
    logPublicStudioBlockError("packages-section", error, [`/api/providers/${studioId}`]);
    return null;
  }

  const [bundles, masters] = await Promise.all([
    getStudioBundles(studioProviderId),
    getStudioMasters(studioId),
  ]);

  if (bundles.length === 0) return null;

  return (
    <div className="fade-in-up">
      <Section
        title={UI_TEXT.publicStudio.packages.heading}
        subtitle={UI_TEXT.publicStudio.packages.subtitle}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {bundles.map((bundle) => (
            <StudioBundleCard
              key={bundle.id}
              bundle={bundle}
              studioTimezone={studioTimezone}
              masters={masters}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
