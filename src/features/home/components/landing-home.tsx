"use client";

import dynamic from "next/dynamic";
import { HeroSection } from "@/features/home/components/hero-section";
import { HowItWorksSection } from "@/features/home/components/how-it-works-section";
import type { PublicStats } from "@/lib/stats/public-stats";

const PopularCategoriesSection = dynamic(
  () => import("@/features/home/components/popular-categories-section").then((m) => m.PopularCategoriesSection),
  { ssr: false, loading: () => <div className="h-40" /> }
);

const PortfolioStoriesBar = dynamic(
  () => import("@/features/home/components/portfolio-stories-bar").then((m) => m.PortfolioStoriesBar),
  { ssr: false, loading: () => <div className="h-28" /> }
);

const HotSlotsPreview = dynamic(
  () => import("@/features/home/components/hot-slots-preview").then((m) => m.HotSlotsPreview),
  { ssr: false, loading: () => <div className="h-40" /> }
);

const TrustSection = dynamic(
  () => import("@/features/home/components/trust-section").then((m) => m.TrustSection),
  { ssr: false, loading: () => <div className="h-40" /> }
);

const BecomeMasterBanner = dynamic(
  () => import("@/features/home/components/become-master-banner").then((m) => m.BecomeMasterBanner),
  { ssr: false, loading: () => <div className="h-32" /> }
);

type Props = {
  stats: PublicStats | null;
};

export function LandingHome({ stats }: Props) {
  return (
    <div className="space-y-12 sm:space-y-16">
      <HeroSection stats={stats} />
      <HowItWorksSection />
      <PopularCategoriesSection />
      <PortfolioStoriesBar />
      <HotSlotsPreview />
      <TrustSection />
      <BecomeMasterBanner />
    </div>
  );
}
