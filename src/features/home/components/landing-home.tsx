"use client";

import { HeroSection } from "@/features/home/components/hero-section";
import { HowItWorksSection } from "@/features/home/components/how-it-works-section";
import { PopularCategoriesSection } from "@/features/home/components/popular-categories-section";
import { PortfolioStoriesBar } from "@/features/home/components/portfolio-stories-bar";
import { HotSlotsPreview } from "@/features/home/components/hot-slots-preview";
import { TrustSection } from "@/features/home/components/trust-section";
import { BecomeMasterBanner } from "@/features/home/components/become-master-banner";

export function LandingHome() {
  return (
    <div className="space-y-12 sm:space-y-16">
      <HeroSection />
      <HowItWorksSection />
      <PopularCategoriesSection />
      <PortfolioStoriesBar />
      <HotSlotsPreview />
      <TrustSection />
      <BecomeMasterBanner />
    </div>
  );
}
