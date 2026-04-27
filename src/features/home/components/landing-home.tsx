"use client";

import dynamic from "next/dynamic";
import { HeroSection } from "@/features/home/components/hero-section";
import { HowItWorksSection } from "@/features/home/components/how-it-works-section";
import { FAQSection } from "@/features/home/components/faq-section";
import type { PublicStats } from "@/lib/stats/public-stats";
import type { ReactNode } from "react";

const PopularCategoriesSection = dynamic(
  () => import("@/features/home/components/popular-categories-section").then((m) => m.PopularCategoriesSection),
  { ssr: false, loading: () => <div className="h-40" /> }
);

const HotSlotsPreview = dynamic(
  () => import("@/features/home/components/hot-slots-preview").then((m) => m.HotSlotsPreview),
  { ssr: false, loading: () => <div className="h-40" /> }
);

const BecomeMasterBanner = dynamic(
  () => import("@/features/home/components/become-master-banner").then((m) => m.BecomeMasterBanner),
  { ssr: false, loading: () => <div className="h-32" /> }
);

type Props = {
  stats: PublicStats | null;
  topMastersSlot?: ReactNode;
};

export function LandingHome({ stats, topMastersSlot }: Props) {
  return (
    <div className="space-y-2">
      <HeroSection stats={stats} />
      <HotSlotsPreview />
      <HowItWorksSection />
      <PopularCategoriesSection />
      {topMastersSlot}
      <BecomeMasterBanner />
      <FAQSection />
    </div>
  );
}
