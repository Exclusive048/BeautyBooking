import type { ReactNode } from "react";
import { CabinetSidebar } from "@/features/cabinet/layout/cabinet-sidebar";

type Props = {
  children: ReactNode;
  userLabel?: string | null;
};

export function CabinetLayout({ children, userLabel }: Props) {
  return (
    <div className="min-h-dvh bg-bg-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:py-10 lg:flex-row lg:items-start">
        <CabinetSidebar userLabel={userLabel} />
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
