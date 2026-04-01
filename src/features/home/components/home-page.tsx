import { HomeFeed } from "@/features/home/components/home-feed";
import { LandingHome } from "@/features/home/components/landing-home";

type Props = {
  isAuthenticated: boolean;
  userName?: string | null;
};

export function HomePage({ isAuthenticated, userName }: Props) {
  if (!isAuthenticated) {
    return <LandingHome />;
  }
  return <HomeFeed isAuthenticated userName={userName} />;
}
