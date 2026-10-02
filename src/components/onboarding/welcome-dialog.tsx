"use client";

import { useId, useRef } from "react";
import { m } from "framer-motion";
import { Copy, HeartHandshake, Mail, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { useToast } from "@/components/ui/toast";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  onClose: () => void;
};

const POINT_ICONS: readonly LucideIcon[] = [TrendingUp, Mail, HeartHandshake];

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: STAGGER * 2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: DISTANCE.nudge },
  visible: { opacity: 1, y: 0, transition: MOTION.base },
};

/**
 * WELCOME-DIALOG-01 — окно «идёт этап тестирования, присылайте замечания».
 * Показывает `WelcomeGate`; любое закрытие (кнопка, Escape, клик мимо) —
 * «видел», окно больше не появится.
 */
export function WelcomeDialog({ onClose }: Props) {
  const t = UI_TEXT.welcome;
  const titleId = useId();
  // Фокус — на заголовок, а не на «Начать»: на телефоне окно длиннее экрана,
  // и фокус на нижней кнопке открывал его прокрученным мимо шапки.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toast = useToast();

  const copyEmail = () => {
    void navigator.clipboard
      ?.writeText(t.email)
      .then(() => toast.success(t.emailCopied))
      .catch(() => {});
  };

  return (
    <ModalSurface
      open
      onClose={onClose}
      size="md"
      ariaLabelledBy={titleId}
      initialFocusRef={headingRef}
      className="overflow-hidden p-0"
    >
      <div className="relative overflow-hidden bg-brand-gradient px-6 pb-7 pt-8 text-white sm:px-8">
        <div
          className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-white/5 blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-white">
            <Sparkles className="h-3 w-3" aria-hidden />
            {t.badge}
          </span>
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="mt-4 font-display text-3xl font-semibold leading-tight outline-none sm:text-4xl"
          >
            {t.titleLead} <em className="italic">{t.titleAccent}</em>
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/85">{t.lead}</p>
        </div>
      </div>

      <div className="px-6 pb-6 pt-5 sm:px-8">
        <m.ul className="space-y-4" variants={listVariants} initial="hidden" animate="visible">
          {t.points.map((point, index) => {
            const Icon = POINT_ICONS[index] ?? Sparkles;
            return (
              <m.li key={point.title} variants={itemVariants} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text">
                  <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-main">{point.title}</p>
                  <p className="mt-0.5 text-sm text-text-sec">{point.text}</p>
                </div>
              </m.li>
            );
          })}
        </m.ul>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-input px-3 py-3 sm:px-4">
          <Mail className="hidden h-4 w-4 shrink-0 text-accent-text sm:block" strokeWidth={1.5} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{t.emailLabel}</p>
            <a
              href={t.emailHref}
              className="block truncate text-sm font-semibold text-text-main underline-offset-4 hover:underline"
            >
              {t.email}
            </a>
          </div>
          <Button variant="icon" size="icon" aria-label={t.copyEmail} title={t.copyEmail} onClick={copyEmail}>
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" asChild>
            <a href={t.emailHref}>{t.write}</a>
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t.start}
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-text-sec sm:text-right">{t.note}</p>
      </div>
    </ModalSurface>
  );
}
