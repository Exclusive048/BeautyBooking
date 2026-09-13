import { UI_TEXT } from "@/lib/ui/text";
import {
  DEFAULT_STUDIO_SETTINGS_SECTION,
  type StudioSettingsData,
  type StudioSettingsSection,
} from "../lib/types";
import { DangerSection } from "./sections/danger-section";
import { NotificationsSection } from "./sections/notifications-section";
import { OwnerTeamSection } from "./sections/owner-team-section";
import { PolicySection } from "./sections/policy-section";
import { PortfolioSection } from "./sections/portfolio-section";
import { ProfileMediaSection } from "./sections/profile-media-section";
import { SettingsNav } from "./settings-nav";

const T = UI_TEXT.studioCabinet.settingsV2;

type Props = {
  data: StudioSettingsData;
  section: StudioSettingsSection;
};

/**
 * Server orchestrator for `/cabinet/studio/settings` (STUDIO-SETTINGS-A).
 *
 * 2-column shell: section nav on the left (danger zone hidden when
 * the current user lacks OWNER scope), active section body on the
 * right. URL state `?section=` drives navigation — same SSR-per-tab
 * pattern as analytics + clients pages.
 */
export function StudioSettingsPage({ data, section }: Props) {
  // Resolve danger fallback at server time so non-owners landing on
  // `?section=danger` via a bookmark see the default section instead
  // of an empty page.
  const effectiveSection: StudioSettingsSection =
    section === "danger" && !data.scope.canDanger
      ? DEFAULT_STUDIO_SETTINGS_SECTION
      : section;

  return (
    <div className="space-y-5 lg:space-y-6">
      <header className="min-w-0">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.header.caption}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {T.header.title}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-text-sec">{T.header.subtitle}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <SettingsNav active={effectiveSection} canDanger={data.scope.canDanger} />
        <div className="min-w-0 space-y-4">
          {effectiveSection === "profile" ? <ProfileMediaSection data={data.general} /> : null}
          {effectiveSection === "portfolio" ? (
            <PortfolioSection providerId={data.general.providerId} />
          ) : null}
          {effectiveSection === "owner-team" ? <OwnerTeamSection team={data.team} /> : null}
          {effectiveSection === "notifications" ? (
            <NotificationsSection data={data.notifications} />
          ) : null}
          {effectiveSection === "policy" ? (
            <PolicySection providerId={data.general.providerId} data={data.policy} />
          ) : null}
          {effectiveSection === "danger" && data.scope.canDanger ? (
            <DangerSection studio={data.general} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
