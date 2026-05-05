import type { ReactNode } from "react";
import { CabinetSidebar } from "@/features/cabinet/layout/cabinet-sidebar";
import { CabinetBottomNav } from "@/features/cabinet/layout/cabinet-bottom-nav";

type Props = {
  children: ReactNode;
  userLabel?: string | null;
  favoritesCount?: number;
};

export function CabinetLayout({ children, userLabel, favoritesCount }: Props) {
  return (
    <div className="min-h-dvh bg-bg-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 pb-24 md:py-10 md:pb-10 lg:flex-row lg:items-start">
        <div className="hidden lg:block">
          <CabinetSidebar userLabel={userLabel} favoritesCount={favoritesCount} />
        </div>
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
      <CabinetBottomNav />
    </div>
  );
}
