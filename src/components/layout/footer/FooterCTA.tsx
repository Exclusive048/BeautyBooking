"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { DISTANCE, MOTION, VIEWPORT_ONCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

const MASTERS_HREF = "/become-master";
const MODELS_HREF = "/models";

type CardCopy = {
  badge: string;
  title: string;
  subtitle: string;
  cta: string;
};

type CardMetric = { value: string; label: string };

type CardTone = "brand" | "soft";

/**
 * Метрики карточки «Для моделей», готовые к показу. Строку с числом собирает
 * `Footer` на сервере (`formatModelOfferCount`): склонение живёт в домене
 * `models`, и клиентский компонент шелла не должен везти его в браузер на
 * каждую страницу (29.09 доработки · 18). `null` — предложений нет или
 * статистика недоступна.
 */
export type FooterModelOfferMetrics = {
  activeLabel: string;
  averageDiscountPercent: number | null;
} | null;

/**
 * FOOTER-HONEST-METRICS (2026-09-15): метрики карточки «Для моделей» — живые
 * (`getPublicModelOfferStats`, считаются в `Footer` на сервере); при нуле
 * открытых предложений или недоступной статистике строка метрик не рендерится
 * вовсе. Число вместе с существительным («12 предложений»), потому что голое
 * «12» под подписью «сейчас» читается хуже, а склонение уже есть у `/models`.
 */
function buildModelMetrics(offers: FooterModelOfferMetrics): CardMetric[] {
  if (!offers) return [];
  const t = UI_TEXT.footer.ctaModels;
  const metrics: CardMetric[] = [{ value: offers.activeLabel, label: t.metricOffersLabel }];
  if (offers.averageDiscountPercent !== null && offers.averageDiscountPercent > 0) {
    metrics.push({ value: `−${offers.averageDiscountPercent}%`, label: t.metricDiscountLabel });
  }
  return metrics;
}

/**
 * FOOTER-REDESIGN-A: two CTAs side-by-side replacing the single
 * brand-aspirational card. One brand-gradient «Для мастеров» card
 * funnels providers into onboarding (`/become-master`); one soft
 * «Для моделей» card surfaces the existing model-offers marketplace
 * (`/models`). Both use shared `<Button>` and project tokens.
 *
 * FOOTER-HONEST-METRICS (2026-09-15, решение владельца): выдуманные
 * маркетинговые числа сняты. У мастеров метрик больше нет вовсе (никакого
 * «+34% записей» — измерить это нечем), у моделей — только то, что
 * считается из БД: число открытых предложений и средняя скидка.
 *
 * Mobile: stack vertically. Desktop: 2-col grid on `lg+`.
 */
export function FooterCTA({ modelOffers }: { modelOffers: FooterModelOfferMetrics }) {
  const modelMetrics = buildModelMetrics(modelOffers);
  return (
    <m.div
      initial={{ opacity: 0, y: DISTANCE.rise }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={MOTION.section}
      className="grid gap-5 lg:grid-cols-2"
    >
      <CTACard
        tone="brand"
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        copy={UI_TEXT.footer.ctaMasters}
        href={MASTERS_HREF}
        metrics={[]}
      />
      <CTACard
        tone="soft"
        icon={<Heart className="h-4 w-4" aria-hidden />}
        copy={UI_TEXT.footer.ctaModels}
        href={MODELS_HREF}
        metrics={modelMetrics}
      />
    </m.div>
  );
}

function CTACard({
  tone,
  icon,
  copy,
  href,
  metrics,
}: {
  tone: CardTone;
  icon: React.ReactNode;
  copy: CardCopy;
  href: string;
  metrics: CardMetric[];
}) {
  const isBrand = tone === "brand";
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 overflow-hidden rounded-3xl border p-6 md:p-8",
        isBrand
          ? "border-transparent bg-brand-gradient text-white shadow-brand"
          : "border-border-subtle bg-elevated text-text-main",
      )}
    >
      {/* Decorative accent — only on brand card, subtle */}
      {isBrand ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white blur-3xl" />
        </div>
      ) : null}

      <div className="relative space-y-2">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wider",
            isBrand
              ? "border-white/25 bg-white/10 text-white"
              : "border-primary/25 bg-primary/10 text-accent-text",
          )}
        >
          {icon}
          <span>{copy.badge}</span>
        </div>
        <h2
          className={cn(
            "font-display text-xl font-semibold leading-tight tracking-tight md:text-2xl",
            isBrand ? "text-white" : "text-text-main",
          )}
        >
          {copy.title}
        </h2>
        <p
          className={cn(
            "max-w-md text-sm leading-relaxed",
            isBrand ? "text-white/85" : "text-text-sec",
          )}
        >
          {copy.subtitle}
        </p>
      </div>

      {metrics.length > 0 ? (
        <div className="relative flex flex-wrap gap-x-6 gap-y-3 pt-1" data-testid="footer-cta-metrics">
          {metrics.map((metric) => (
            <Metric key={metric.label} value={metric.value} label={metric.label} isBrand={isBrand} />
          ))}
        </div>
      ) : null}

      <div className="relative mt-auto">
        <Button
          asChild
          variant={isBrand ? "inverted" : "primary"}
          size="md"
          className="inline-flex items-center gap-1.5"
        >
          <Link href={href}>
            {copy.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  isBrand,
}: {
  value: string;
  label: string;
  isBrand: boolean;
}) {
  return (
    <div className="min-w-[120px]">
      {/* FOOTER-HONEST-METRICS: кегль скромнее прежнего `text-2xl` — числа
          теперь настоящие и служебные, а не рекламный крик. */}
      <div
        className={cn(
          "font-display text-lg font-semibold tabular-nums",
          isBrand ? "text-white" : "text-text-main",
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "text-xs",
          isBrand ? "text-white/75" : "text-text-sec",
        )}
      >
        {label}
      </div>
    </div>
  );
}
