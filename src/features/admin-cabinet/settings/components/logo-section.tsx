import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * PERF-25: серверный компонент. Интерактивность целиком в `<AvatarEditor>`
 * (свой `"use client"`), сюда не приходит ни одного пропа — секция была
 * лишней точкой входа в клиентский бандл админки.
 */
export function LogoSection() {
  const t = UI_TEXT.adminPanel.settings.sections.logo;
  return (
    <SectionCard title={t.title} description={t.desc}>
      <div className="flex items-center gap-4">
        <AvatarEditor entityType="SITE" entityId="site" sizeClassName="h-20 w-20" />
        <p className="text-xs text-text-sec">{t.hint}</p>
      </div>
    </SectionCard>
  );
}
