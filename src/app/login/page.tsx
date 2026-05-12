import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import LoginClient from "./login-client";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { getSessionUser } from "@/lib/auth/session";
import { getLoginHeroImageAsset } from "@/lib/media/queries";
import { isEmailConfigured } from "@/lib/email/sender";
import { getPublicStats, type PublicStats } from "@/lib/stats/public-stats";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    const decision = await resolveCabinetRedirect(user.id);
    redirect(decision.target);
  }
  const [heroImage, stats] = await Promise.all([
    getLoginHeroImageAsset(),
    getPublicStats().catch((): PublicStats | null => null),
  ]);

  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <LoginClient
        heroImageUrl={heroImage?.url ?? null}
        emailEnabled={isEmailConfigured()}
        stats={stats}
      />
    </Suspense>
  );
}
