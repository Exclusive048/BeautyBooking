import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import LoginClient from "./login-client";
import LoginUnavailable from "./login-unavailable";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { getSessionUser } from "@/lib/auth/session";
import { getLoginHeroImageAsset } from "@/lib/media/queries";
import { getPublicStats, type PublicStats } from "@/lib/stats/public-stats";
import { env } from "@/lib/env";
import { resolveAuthMethods } from "@/lib/auth/auth-methods";
import { parseInternalPath } from "@/lib/http/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getSessionUser();
  if (user) {
    // SESSION-LOSS-01: вошедшего (в т.ч. с сессией, обновлённой прокси прямо
    // на этом запросе) возвращаем туда, откуда его привели на вход, — иначе
    // `?next=` работал только после ввода кода.
    const nextRaw = (await searchParams).next;
    const next = parseInternalPath(typeof nextRaw === "string" ? nextRaw : null);
    if (next && !next.startsWith("/login")) redirect(next);
    const decision = await resolveCabinetRedirect(user.id);
    redirect(decision.target);
  }

  // AUTH-GATE-01: every method flag now comes from one server-side resolver
  // (it already folds in the FIX-TELEGRAM-KILLSWITCH env ceiling + admin
  // toggle). Resolving here and passing down keeps the server and client
  // rendering the same branch — the QA-001 rule for this page.
  const methods = await resolveAuthMethods();

  // Nothing to log in with → calm "скоро" state instead of a form whose every
  // control is hidden. Skips the hero/stats queries entirely.
  if (!methods.any) {
    return <LoginUnavailable />;
  }

  const [heroImage, stats] = await Promise.all([
    getLoginHeroImageAsset(),
    getPublicStats().catch((): PublicStats | null => null),
  ]);

  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <LoginClient
        heroImageUrl={heroImage?.url ?? null}
        // AUTH-GATE-01: phone OTP is a gated method like any other. When false
        // the phone tab/field is absent and the form opens straight on email —
        // the `/api/auth/otp/*` routes refuse independently, so this is the
        // cosmetic half of a two-layer gate, never the only one.
        phoneEnabled={methods.phone}
        emailEnabled={methods.email}
        stats={stats}
        // QA-001: resolve NEXT_PUBLIC_* on the server (real values) and pass
        // down — avoids the client `env`-alias returning `undefined` and the
        // social buttons rendering a different branch than the server HTML.
        // FIX-TELEGRAM-KILLSWITCH: don't leak the bot username into the
        // serialized props when Telegram is off (no rendered button + no trace
        // in the RSC payload).
        telegramBotUsername={methods.telegram ? (env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "") : ""}
        telegramEnabled={methods.telegram}
        // FIX-EXTERNAL-GATING-01 (G-5): gate VK on the full, server-computed
        // `isVkAuthEnabled` (public flag AND a configured client id), symmetric
        // with `yandexEnabled` below — the previous `NEXT_PUBLIC_VK_ENABLED`-only
        // check would paint a VK button that 503s in a flag-on/no-client-id
        // config. The client can't compute this (VK_CLIENT_ID is server-only),
        // so it's resolved here and passed down.
        vkEnabled={methods.vk}
        // FIX-YANDEX-OAUTH: button absent until a Yandex OAuth app is registered
        // (isYandexAuthEnabled requires both the flag AND a client id).
        yandexEnabled={methods.yandex}
      />
    </Suspense>
  );
}
