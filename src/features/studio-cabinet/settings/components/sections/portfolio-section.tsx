import { MediaEntityType } from "@prisma/client";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";
import { UI_TEXT } from "@/lib/ui/text";
import { SectionCard } from "../section-card";

const T = UI_TEXT.studioCabinet.settingsV2.portfolio;

type Props = {
  providerId: string;
};

/**
 * «Портфолио» — studio portfolio upload. Ported from the old orphan
 * `settings/portfolio` route (LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE) by
 * mounting the same `PortfolioEditor` (entityType STUDIO) — same upload
 * path, now reachable from the settings nav.
 */
export function PortfolioSection({ providerId }: Props) {
  return (
    <SectionCard title={T.cardTitle} description={T.cardDesc}>
      <PortfolioEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit />
    </SectionCard>
  );
}
