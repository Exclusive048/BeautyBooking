import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-metadata";
import * as UI_TEXT from "@/lib/ui/text";
import { HomePage as HomeFeedPage } from "@/features/home/components/home-page";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicStats } from "@/lib/stats/public-stats";
import { logError } from "@/lib/logging/logger";

// FIX-EXP-CONTENT-GRAMMAR (EXP-001): brand-first homepage title via `absolute`
// so the root template ("%s | МастерРядом") doesn't append a second brand.
// SEO-02: те же заголовок и описание, что у корневого layout, — главная и
// превью ссылки на неё говорят одно.
export const metadata: Metadata = pageMetadata(UI_TEXT.meta, { path: "/", absoluteTitle: true });

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
