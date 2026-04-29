"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HeroSection } from "@/features/marketing/sections/hero-section";
import { CompactHero } from "@/features/model-offers/components/compact-hero";
import { markModelsIntroSeen } from "@/lib/model-offers/intro-seen-action";
import type { ModelOfferUserState } from "@/lib/model-offers/user-state";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  userState: ModelOfferUserState;
  /** EducationalSections rendered as server component, passed in as JSX. */
  children: ReactNode;
};

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

/**
 * Orchestrates the top of /models — hero + educational content — based on
 * whether the visitor is new or returning. The educational sections come in
 * as `children` so they stay server-rendered (out of the client bundle).
 *
 * On first visit (newcomer), a fire-and-forget server action sets the
 * `models-intro-seen` cookie so the next visit gets the compact treatment.
 */
export function ModelsTopBlock({ userState, children }: Props) {
  const [open, setOpen] = useState(false);
  const educationalRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Fire-and-forget cookie marker on first visit. Failures are silent — at
  // worst the user stays a "newcomer" for one more visit, which is harmless.
  useEffect(() => {
    if (userState !== "newcomer") return;
    void markModelsIntroSeen().catch(() => undefined);
  }, [userState]);

  if (userState === "newcomer") {
    return (
      <>
        <HeroSection
          eyebrow={UI_TEXT.models.hero.eyebrow}
          title={
            <>
              Услуги{" "}
              <em className="font-display font-normal italic text-primary">со скидкой</em>{" "}
              за участие в практике мастера
            </>
          }
          description="Мастера ищут моделей для отработки техник или контента в портфолио. Вы получаете услугу со скидкой — мастер получает практику или фото для соцсетей."
          cta={{
            primary: { label: "Смотреть предложения", href: "#offers" },
            secondary: {
              label: "Я мастер — опубликовать оффер",
              href: "/cabinet/master/model-offers",
            },
          }}
        />
        {children}
      </>
    );
  }

  // Returning user — compact hero with collapsible educational.
  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Wait for the AnimatePresence child to mount before scrolling so the
      // browser has a target to scroll to.
      requestAnimationFrame(() => {
        educationalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <>
      <CompactHero open={open} onLearnMoreClick={handleToggle} />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            ref={educationalRef}
            key="educational"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
