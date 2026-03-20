import type { Metadata } from "next";
import Link from "next/link";
import SupportPageClient from "./support-client";
import { getSessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";
import { resolveSupportContactFromUser } from "@/lib/support/contact";
import type { SupportContactOption } from "@/lib/support/contact-shared";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.support.title,
  description: UI_TEXT.pages.support.description,
};

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
        : null
    );
    contactOptions = resolved.options;
  } catch (error) {
    logError("Support page contact prefill failed", {
      route: "GET /support",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <main className="mx-auto max-w-[680px] px-4 py-12 md:py-20 space-y-10">

      {/* Hero */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {UI_TEXT.pages.support.heroBadge}
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          {UI_TEXT.pages.support.heroTitle}
        </h1>
        <p className="text-text-sec">
          {UI_TEXT.pages.support.heroSubtitle}
        </p>
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/faq"
          className="lux-card rounded-[16px] bg-bg-card p-4 flex items-start gap-3 hover:ring-1 hover:ring-border-subtle transition-all"
        >
          <span className="text-xl">❓</span>
          <div>
            <p className="text-sm font-medium text-text-main">{UI_TEXT.pages.support.faqTitle}</p>
            <p className="text-xs text-text-sec mt-0.5">{UI_TEXT.pages.support.faqDescription}</p>
          </div>
        </Link>
        <a
          href="https://t.me/МастерРядом_support"
          target="_blank"
          rel="noopener noreferrer"
          className="lux-card rounded-[16px] bg-bg-card p-4 flex items-start gap-3 hover:ring-1 hover:ring-border-subtle transition-all"
        >
          <span className="text-xl">💬</span>
          <div>
            <p className="text-sm font-medium text-text-main">{UI_TEXT.pages.support.telegramTitle}</p>
            <p className="text-xs text-text-sec mt-0.5">{UI_TEXT.pages.support.telegramDescription}</p>
          </div>
        </a>
      </div>

      {/* Form */}
      <div className="lux-card rounded-[24px] bg-bg-card p-7">
        <h2 className="text-lg font-semibold text-text-main mb-6">{UI_TEXT.pages.support.formTitle}</h2>
        <SupportPageClient contactOptions={contactOptions} />
      </div>
    </main>
  );
}

