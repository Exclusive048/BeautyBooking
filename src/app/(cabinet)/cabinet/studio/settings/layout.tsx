import type { ReactNode } from "react";
import { StudioSettingsSidebar } from "@/features/studio-cabinet/components/studio-settings-sidebar";

type Props = {
  children: ReactNode;
};

export default function StudioSettingsLayout({ children }: Props) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full lg:w-[260px] lg:shrink-0">
        <div className="glass-panel rounded-[26px] p-4 lg:sticky lg:top-24">
          <div className="text-xs uppercase tracking-[0.2em] text-text-sec">Настройки</div>
          <div className="mt-2">
            <StudioSettingsSidebar />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
