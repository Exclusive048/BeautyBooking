import Link from "next/link";
import { Clock3 } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.auth.loginPage.unavailable;

/**
 * AUTH-GATE-01 — what `/login` renders when NO auth method is available
 * (phone gated off via `PHONE_AUTH_ENABLED`, and no email/VK/Yandex/Telegram).
 *
 * Deliberately a calm terminal state, not an error: nothing failed, the door is
 * simply not open yet. So there is no `role="alert"`, no destructive tone, and
 * the primary CTA points at the part of the product that DOES work — the
 * catalog and the guest booking flow, neither of which needs an account.
 *
 * The route keeps its `robots: noindex` metadata (set in page.tsx), so this
 * state never gets indexed and leaves no "вход скоро" residue in search
 * results once the flag is flipped back on.
 */
export default function LoginUnavailable() {
  return (
    <div className="flex min-h-[calc(100dvh-var(--topbar-h))] items-center justify-center bg-bg-page px-4 py-10">
      {/* LOGIN-WOW-01: the entrance is the CSS `.login-rise` class, not a
          framer `initial` — framer serialises `opacity:0` into the SSR HTML, so
          this page rendered BLANK until hydration finished. It is a terminal
          state a visitor may land on with a cold cache; it has to paint on the
          first frame. Removing framer here also drops the last reason for this
          file to be a client component. */}
      <div className="login-rise w-full max-w-[440px] rounded-3xl border border-border-subtle bg-bg-card p-8 text-center shadow-brand">
        <div className="mb-6 flex justify-center">
          {/* See the login form's mobile hint: the gradient wordmark is
              burgundy in both themes and loses contrast on the dark card. */}
          <BrandLogo variant="full" size="sm" href={null} textClassName="dark:text-text-main" />
        </div>

        <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-white">
          <Clock3 className="h-5 w-5" aria-hidden />
        </span>

        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-text-main">
          {T.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-sec">{T.body}</p>

        <div className="mt-7 space-y-2.5">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/catalog">{T.catalogCta}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/">{T.homeCta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
