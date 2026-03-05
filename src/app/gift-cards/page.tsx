import type { Metadata } from "next";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.giftCards.title,
  description: UI_TEXT.pages.giftCards.description,
};

export default function GiftCardsPage() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-12 md:py-24 text-center space-y-8">
      <div className="text-6xl">🎁</div>
      <h1 className="text-4xl font-bold text-text-main tracking-tight">
        {UI_TEXT.pages.giftCards.heading}
      </h1>
      <p className="text-text-sec text-lg max-w-[460px] mx-auto leading-relaxed">
        {UI_TEXT.pages.giftCards.heroText}
      </p>
      <div className="lux-card rounded-[24px] bg-bg-card p-8 space-y-4 text-left max-w-[480px] mx-auto">
        <p className="font-semibold text-text-main">{UI_TEXT.pages.giftCards.plannedTitle}</p>
        <ul className="space-y-2 text-sm text-text-sec">
          {UI_TEXT.pages.giftCards.plannedItems.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-text-sec">
        {UI_TEXT.pages.giftCards.footerText}{" "}
        <a
          href="https://t.me/МастерРядом_news"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {UI_TEXT.pages.giftCards.footerCta}
        </a>
      </p>
    </main>
  );
}

