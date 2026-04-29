import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SupportPageClient from "./support-client";
import { MarketingLayout } from "@/features/marketing/components/marketing-layout";
import { getSessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";
import { resolveSupportContactFromUser } from "@/lib/support/contact";
import type { SupportContactOption } from "@/lib/support/contact-shared";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: "Поддержка — МастерРядом",
  description:
    "Сообщите об ошибке или предложите улучшение МастерРядом. Мы ответим в течение дня.",
  alternates: { canonical: "/support" },
};

const T = UI_TEXT.support;

export default async function SupportPage() {
  let contactOptions: SupportContactOption[] = [];

  try {
    const user = await getSessionUser();
    const resolved = await resolveSupportContactFromUser(
      user
        ? {
            id: user.id,
            email: user.email ?? null,
            phone: user.phone ?? null,
            telegramId: user.telegramId ?? null,
          }
        : null,
    );
    contactOptions = resolved.options;
  } catch (error) {
    logError("Support page contact prefill failed", {
      route: "GET /support",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <MarketingLayout>
      {/* Hero — minimal inline like /faq, not the heavy <HeroSection>.
          This is a utility page; tone is supportive, not marketing. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl dark:bg-primary/12"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary-magenta/8 blur-3xl dark:bg-primary-magenta/12"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center lg:py-16">
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {T.hero.eyebrow}
          </p>
          <h1 className="mb-4 font-display text-3xl leading-[1.1] text-text-main lg:text-4xl">
            {T.hero.titleBefore}{" "}
            <em className="font-display font-normal italic text-primary">{T.hero.titleItalic}</em>
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-text-sec">
            {T.hero.description}
          </p>
        </div>
      </section>

      {/* Quick links — before the form, so a self-serve answer takes priority.
          Single FAQ card centered (Telegram bot removed as a support channel). */}
      <section className="pb-8">
        <div className="mx-auto max-w-3xl px-4">
          <p className="mb-6 text-center text-sm text-text-sec">{T.quickLinks.description}</p>
          <div className="mx-auto max-w-md">
            <Link
              href="/faq"
              className="group flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-card/50 p-5 transition-colors hover:border-primary/30"
            >
              <div className="min-w-0">
                <p className="mb-0.5 font-medium text-text-main">{T.quickLinks.faq.title}</p>
                <p className="text-sm text-text-sec">{T.quickLinks.faq.description}</p>
              </div>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-text-sec transition-colors group-hover:text-primary"
                aria-hidden
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Form — production-ready <SupportPageClient> rendered 1:1, no edits.
          Server-side contactOptions prop chain is preserved exactly. */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-6">
            <h2 className="mb-2 font-display text-2xl text-text-main lg:text-3xl">
              {T.form.sectionTitle}
            </h2>
            <p className="leading-relaxed text-text-sec">{T.form.sectionDescription}</p>
          </div>
          <SupportPageClient contactOptions={contactOptions} />
        </div>
      </section>

      {/* Alternative contact — email only. */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <p className="mb-3 text-sm text-text-sec">{T.alternativeContact.description}</p>
        <a
          href={T.alternativeContact.emailHref}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {T.alternativeContact.email}
        </a>
      </section>
    </MarketingLayout>
  );
}
