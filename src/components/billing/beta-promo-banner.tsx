import Link from "next/link";
import { Sparkles } from "lucide-react";
import { isLaunchPromoActive } from "@/lib/billing/launch-promo";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  /**
   * Ссылка «Подробнее о тарифах». В окне приветствия её нет: окно живёт в шелле
   * и переход по ссылке оставил бы его открытым поверх новой страницы.
   */
  showPricingLink?: boolean;
  className?: string;
  /** Момент проверки границы акции — для тестов. */
  now?: Date;
};

/**
 * BETA-PROMO-DEC (2026-10-29) — плашка для новых пользователей: пока идёт
 * бета-тестирование, кабинеты мастеров и студий получают PREMIUM без оплаты
 * (механика — LAUNCH-PROMO-01, `lib/billing/launch-promo.ts`). После конца
 * акции не рендерится: граница та же, что у выдачи PREMIUM и checkout.
 *
 * Без хуков и без `"use client"` — её рендерят и серверные страницы
 * (`/cabinet/roles`, `/become-master`), и клиентское окно приветствия.
 */
export function BetaPromoBanner({ showPricingLink = true, className, now }: Props) {
  if (!isLaunchPromoActive(now)) return null;
  const t = UI_TEXT.betaPromo;

  return (
    <div
      data-testid="beta-promo-banner"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] px-4 py-4 sm:px-5",
        className,
      )}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="eyebrow text-accent-text">{t.eyebrow}</p>
        <p className="mt-1 font-display text-lg leading-snug text-text-main">
          {t.title} <em className="font-display font-normal italic text-accent-text">{t.titleAccent}</em>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-text-sec">{t.text}</p>
        {showPricingLink ? (
          <Link
            href="/pricing"
            className="mt-2 inline-block text-sm font-medium text-accent-text underline-offset-4 hover:underline"
          >
            {t.pricingLink}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
