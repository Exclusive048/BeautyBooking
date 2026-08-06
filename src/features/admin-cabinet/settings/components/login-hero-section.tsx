import { LoginHeroImageManager } from "@/features/media/components/login-hero-image-manager";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * PERF-25: серверный компонент — граница у `<LoginHeroImageManager>`,
 * см. соседний `logo-section.tsx`.
 */
export function LoginHeroSection() {
  const t = UI_TEXT.adminPanel.settings.sections.loginHero;
  return (
    <SectionCard title={t.title} description={t.desc}>
      <LoginHeroImageManager />
    </SectionCard>
  );
}
