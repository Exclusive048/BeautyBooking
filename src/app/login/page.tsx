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
import { env } from "@/lib/env";

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
        // QA-001: resolve NEXT_PUBLIC_* on the server (real values) and pass
        // down — avoids the client `env`-alias returning `undefined` and the
        // social buttons rendering a different branch than the server HTML.
        telegramBotUsername={env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""}
        vkEnabled={String(env.NEXT_PUBLIC_VK_ENABLED) === "true"}
      />
    </Suspense>
  );
}
