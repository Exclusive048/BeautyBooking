import { HomeFeed } from "@/features/home/components/home-feed";
import { LandingHome } from "@/features/home/components/landing-home";
import type { PublicStats } from "@/lib/stats/public-stats";

type Props = {
  isAuthenticated: boolean;
  userName?: string | null;
  stats: PublicStats | null;
};

export function HomePage({ isAuthenticated, userName, stats }: Props) {
  if (!isAuthenticated) {
    return <LandingHome stats={stats} />;
  }
  return <HomeFeed isAuthenticated userName={userName} />;
}
