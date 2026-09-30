import { Suspense } from "react";
import { AccountDeletedNotice } from "@/features/home/components/account-deleted-notice";
import { HomeFeed } from "@/features/home/components/home-feed";
import { LandingHome } from "@/features/home/components/landing-home";
import { TopMastersSection, TopMastersSkeleton } from "@/features/home/components/top-masters-section";
import type { PublicStats } from "@/lib/stats/public-stats";

type Props = {
  isAuthenticated: boolean;
  userName?: string | null;
  stats: PublicStats | null;
};

export function HomePage({ isAuthenticated, userName, stats }: Props) {
  // Итог удаления аккаунта — на обеих ветках: после удаления человек уже гость.
  const deletedNotice = (
    <Suspense fallback={null}>
      <AccountDeletedNotice />
    </Suspense>
  );
  if (!isAuthenticated) {
    return (
      <>
        {deletedNotice}
        <LandingHome
          stats={stats}
          topMastersSlot={
            <Suspense fallback={<TopMastersSkeleton />}>
              <TopMastersSection />
            </Suspense>
          }
        />
      </>
    );
  }
  return (
    <>
      {deletedNotice}
      <HomeFeed isAuthenticated userName={userName} />
    </>
  );
}
