import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { getSiteSeo } from "@/lib/seo/site-seo";
import { HomePage as HomeFeedPage } from "@/features/home/components/home-page";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicStats } from "@/lib/stats/public-stats";
import { logError } from "@/lib/logging/logger";

// FIX-EXP-CONTENT-GRAMMAR (EXP-001): brand-first homepage title via `absolute`
// so the root template ("%s | МастерРядом") doesn't append a second brand.
// SEO-02: главная и превью ссылки на неё говорят одно.
// SEO-ADMIN-01: заголовок и описание — из «SEO главной страницы» в админке,
// пустое поле — текст из кода (`UI_TEXT.meta`).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getSiteSeo(), { path: "/", absoluteTitle: true });
}

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
