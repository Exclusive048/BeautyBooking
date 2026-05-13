import { LoginHeroSection } from "@/features/admin-cabinet/settings/components/login-hero-section";
import { LogoSection } from "@/features/admin-cabinet/settings/components/logo-section";
import { MediaCleanupSection } from "@/features/admin-cabinet/settings/components/media-cleanup-section";
import { QueueStatusSection } from "@/features/admin-cabinet/settings/components/queue-status-section";
import { SeoSection } from "@/features/admin-cabinet/settings/components/seo-section";
import { SettingsHeader } from "@/features/admin-cabinet/settings/components/settings-header";
import { SystemFlagsSection } from "@/features/admin-cabinet/settings/components/system-flags-section";
import { VisualSearchSection } from "@/features/admin-cabinet/settings/components/visual-search-section";
import type { AdminSettingsSnapshot } from "@/features/admin-cabinet/settings/types";

type Props = {
  data: AdminSettingsSnapshot;
};

/** Server orchestrator for `/admin/settings`. Layout: caption →
 * logo + login hero (2-col on lg) → flags → SEO → queue → visual
 * search + media cleanup (2-col on lg). Each section ships its own
 * mutations; this component is pure render. */
export function AdminSettings({ data }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <SettingsHeader />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr] lg:gap-5">
        <LogoSection />
        <LoginHeroSection />
      </div>

      <SystemFlagsSection initial={data.flags} />

      <SeoSection initial={data.seo} />

      <QueueStatusSection initial={data.queue} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <VisualSearchSection
          initial={data.visualSearch}
          enabled={data.flags.visualSearchEnabled}
        />
        <MediaCleanupSection initial={data.mediaCleanup} />
      </div>
    </div>
  );
}
