import type { Metadata } from "next";
import { HomePage as HomeFeedPage } from "@/features/home/components/home-page";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicStats } from "@/lib/stats/public-stats";
import { logError } from "@/lib/logging/logger";

export const metadata: Metadata = {
  title: "МастерРядом — запись к мастерам онлайн",
  description:
    "Найди мастера маникюра, массажа или стрижки рядом. Онлайн-запись.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [user, stats] = await Promise.all([
    getSessionUser(),
    getPublicStats().catch((err: unknown) => {
      logError("HomePage: failed to load public stats", { error: String(err) });
      return null;
    }),
  ]);

  return (
    <HomeFeedPage
      isAuthenticated={!!user}
      userName={user?.displayName ?? null}
      stats={stats}
    />
  );
}
