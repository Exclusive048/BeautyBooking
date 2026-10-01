"use client";

import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import {
  BellRing,
  CalendarClock,
  Images,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ResilientImage } from "@/components/ui/resilient-image";
import type { PublicStats } from "@/lib/stats/public-stats";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";

// Marquee benefit cards — visual device only. Copy lives in UI_TEXT; the icons
// are paired here by index (icons are not UI text). No invented person, quote
// or rating (LOGIN-REDESIGN-01 marquee decision).
const MARQUEE_ICONS: LucideIcon[] = [Zap, Wallet, Images, BellRing, CalendarClock, ShieldCheck];

/**
 * Entrance stagger, expressed as delays for the CSS `.login-rise` class rather
 * than framer variants. See globals.css: a framer `initial` is serialised into
 * the SSR HTML as `opacity:0`, which left this whole stage blank until
 * hydration; a CSS animation starts at first paint instead.
 */
const RISE_DELAY = {
  brand: "60ms",
  stat: "150ms",
  tagline: "240ms",
  stack: "330ms",
} as const;

/**
 * Moves one parallax plane. Written straight to `style.transform` (not React
 * state) so a pointer move never re-renders the tree; the easing lives on
 * `.login-layer` in globals.css.
 */
function moveLayer(el: HTMLElement | null, dx: number, dy: number): void {
  if (el) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
}

type LoginShowcaseProps = {
  heroImageUrl: string | null;
  stats: PublicStats | null;
};

/**
 * LOGIN-WOW-01 — the brand stage left of the form (desktop only).
 *
 * Built as four depth planes rather than one flat surface, which is what makes
 * it read as composed instead of decorated:
 *
 *   1. aurora blobs   (furthest, moves most)
 *   2. sparkles
 *   3. photo plate    — the hero image, tilted and framed, *behind* the cards
 *   4. glass cards    (nearest, moves least and in the opposite direction)
 *
 * Pointer parallax drives each plane at a different rate — the differential IS
 * the depth cue. It is desktop-only (the whole aside is `hidden lg:flex`) and
 * `useReducedMotion` disables it outright, along with every looping animation,
 * which is gated in CSS behind `prefers-reduced-motion: no-preference`.
 *
 * The hero image is optional (`getLoginHeroImageAsset` returns null until an
 * admin sets one). Without it the plate falls back to a brand-gradient panel,
 * so the composition keeps all four planes and never shows a hole.
 */
export function LoginShowcase({ heroImageUrl, stats }: LoginShowcaseProps) {
  const reduce = useReducedMotion();
  const paneRef = useRef<HTMLElement | null>(null);
  const auroraRef = useRef<HTMLDivElement | null>(null);
  const sparkRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);

  const T = UI_TEXT.auth.loginPage;

  const marqueeCards = T.marquee.map((card, index) => ({
    ...card,
    Icon: MARQUEE_ICONS[index % MARQUEE_ICONS.length],
  }));
  const marqueeColA = marqueeCards.slice(0, 3);
  const marqueeColB = marqueeCards.slice(3, 6);

  function handlePaneMouseMove(event: React.MouseEvent<HTMLElement>) {
    if (reduce) return;
    const pane = paneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    moveLayer(auroraRef.current, x * 26, y * 22);
    moveLayer(sparkRef.current, x * 15, y * 13);
    // Foreground drifts against the background — a small counter-move sells the
    // depth far better than a larger same-direction one.
    moveLayer(stackRef.current, x * -10, y * -8);
  }

  function handlePaneMouseLeave() {
    moveLayer(auroraRef.current, 0, 0);
    moveLayer(sparkRef.current, 0, 0);
    moveLayer(stackRef.current, 0, 0);
  }

  const renderMarqueeCard = (
    card: (typeof marqueeCards)[number],
    key: string,
    tier: "near" | "far",
  ) => {
    const Icon = card.Icon;
    const near = tier === "near";
    return (
      <div
        key={key}
        className={
          near
            ? "flex-none rounded-2xl border border-white/15 bg-white/[0.09] p-3.5 shadow-[0_18px_36px_-18px_rgb(0_0_0/0.75)] backdrop-blur-md"
            : "flex-none rounded-2xl border border-white/10 bg-white/[0.05] p-3 shadow-[0_12px_26px_-16px_rgb(0_0_0/0.65)] backdrop-blur-md"
        }
      >
        <div className={near ? "flex items-center gap-2.5" : "flex items-center gap-2"}>
          <span
            className={
              near
                ? "flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-gradient text-white ring-1 ring-white/20"
                : "flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-gradient text-white ring-1 ring-white/15"
            }
          >
            <Icon className={near ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
          </span>
          {/* The badge sits on the SUBTITLE line, not beside the title: on the
              title line it ate ~50px of a 152px text column and turned every
              benefit into «Оплата посл…». Subtitles tolerate truncation, titles
              do not. */}
          <div className="min-w-0 flex-1">
            <div
              className={
                near
                  ? "truncate text-[13px] font-semibold text-white"
                  : "truncate text-[12px] font-semibold text-white/90"
              }
            >
              {card.title}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  near
                    ? "truncate text-2xs text-white/60"
                    : "truncate text-2xs text-white/50"
                }
              >
                {card.subtitle}
              </span>
              {card.badge ? (
                <span className="ml-auto flex-none rounded-full bg-white/10 px-2 py-0.5 font-mono text-3xs uppercase tracking-wider text-white/75">
                  {card.badge}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      ref={paneRef}
      onMouseMove={handlePaneMouseMove}
      onMouseLeave={handlePaneMouseLeave}
      className="login-grain login-sheen relative isolate hidden h-full max-h-[760px] min-h-0 flex-col overflow-hidden rounded-3xl bg-brand-pane text-white lg:flex"
    >
      {/* Plane 1 — layered animated aurora (parallax target) */}
      <div ref={auroraRef} className="login-aurora login-layer" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

      {/* Plane 2 — twinkling sparkles, drifting at their own rate */}
      <div ref={sparkRef} className="login-layer absolute inset-0 z-1" aria-hidden>
        <svg
          className="login-spark"
          style={{ top: "16%", right: "12%", animationDelay: "0s" }}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 0l2.4 9.6L24 12l-9.6 2.4L12 24l-2.4-9.6L0 12l9.6-2.4z" />
        </svg>
        <svg
          className="login-spark"
          style={{ top: "34%", left: "7%", animationDelay: "1.6s" }}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 0l2.4 9.6L24 12l-9.6 2.4L12 24l-2.4-9.6L0 12l9.6-2.4z" />
        </svg>
        <svg
          className="login-spark"
          style={{ top: "9%", left: "40%", animationDelay: "3.1s" }}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 0l2.4 9.6L24 12l-9.6 2.4L12 24l-2.4-9.6L0 12l9.6-2.4z" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-2 flex h-full flex-col justify-between p-10">
        {/* Brand block — gradient iconmark + white wordmark over the dark
            stage. `textClassName="text-white"` overrides the wordmark's
            gradient text-clip so it stays readable on the burgundy backdrop;
            the iconmark keeps its gradient for brand identity (proven
            legible on this pane pre-redesign). */}
        <div className="login-rise" style={{ animationDelay: RISE_DELAY.brand }}>
          <BrandLogo variant="full" size="md" href={null} textClassName="text-white" />
          <p className="mt-1.5 font-mono text-3xs tracking-[0.08em] text-white/60">
            {UI_TEXT.brand.tagline}
          </p>
        </div>

        {/* Badge + headline + subtitle */}
        <div className="py-6">
          {stats ? (
            <div
              className="login-rise mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[12.5px] backdrop-blur-md"
              style={{ animationDelay: RISE_DELAY.stat }}
            >
              <span className="login-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              <span className="tabular-nums">
                {UI_FMT.countShort(stats.masters)} {T.socialProofMastersLabel}
              </span>
            </div>
          ) : null}

          <h1 className="font-display text-[2.5rem] font-medium leading-[1.06] tracking-tight xl:text-[3rem]">
            <span className="login-word-mask">
              <span className="login-word" style={{ animationDelay: "150ms" }}>
                {T.brandHeadlineLead}
              </span>
            </span>
            <br />
            <span className="login-word-mask">
              <span className="login-word" style={{ animationDelay: "260ms" }}>
                {T.brandHeadlineWith}{" "}
                <em className="login-shimmer font-display font-semibold italic">
                  {T.brandHeadlineAccent}
                </em>
              </span>
            </span>
          </h1>

          <p
            className="login-rise mt-5 max-w-md text-[15px] leading-relaxed text-white/80"
            style={{ animationDelay: RISE_DELAY.tagline }}
          >
            {T.brandTagline}
          </p>
        </div>

        {/* Showcase stack — planes 3 + 4. Two nested divs on purpose: the outer
            one carries the entrance (`.login-rise` animates `transform`), the
            inner one is the parallax target the pointer handler writes
            `transform` to. On a single node the running animation would simply
            overwrite every parallax offset. */}
        <div className="login-rise relative" style={{ animationDelay: RISE_DELAY.stack }}>
          <div ref={stackRef} className="login-layer relative">
            {/* Plane 3 — tilted photo plate. It sits behind the frosted cards,
                which are translucent, so it reads THROUGH them: that is the
                layering, not a backdrop the cards merely cover. */}
            <div
              className="login-plate absolute -inset-x-1 -inset-y-3 overflow-hidden rounded-3xl ring-1 ring-white/10"
              // Same top/bottom fade as the card marquee, so the plate dissolves
              // into the aurora instead of ending on a hard rectangle edge.
              style={{
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)",
                maskImage:
                  "linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)",
              }}
              aria-hidden
            >
              {heroImageUrl ? (
                <ResilientImage
                  src={heroImageUrl}
                  alt=""
                  // Desktop-only surface: the 1px descriptor keeps a phone from
                  // downloading a decorative image it will never render.
                  sizes="(min-width: 1024px) 480px, 1px"
                  className="object-cover opacity-60"
                />
              ) : (
                <div className="absolute inset-0 bg-brand-gradient opacity-70" />
              )}
              {/* Scrim: keeps card text at full contrast whatever the photo is. */}
              <div className="absolute inset-0 bg-gradient-to-b from-brand-pane/70 via-brand-pane/45 to-brand-pane/80" />
            </div>

            {/* Plane 4 — marquee of benefit cards, two depth tiers.
                `min-w-0` on the columns is load-bearing: a flex item defaults to
                `min-width:auto`, so the columns were floored at the cards'
                min-content width (259px + 239px against a 460px zone) and the
                right column ran past the pane's edge, clipping its cards. */}
            <div
              className="login-mq-zone relative z-1 flex h-[224px] gap-4 overflow-hidden"
              style={{
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)",
                maskImage:
                  "linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)",
              }}
              aria-hidden
            >
              <div className="login-mq-col min-w-0 flex-1">
                {[...marqueeColA, ...marqueeColA].map((card, index) =>
                  renderMarqueeCard(card, `a-${index}`, "near"),
                )}
              </div>
              {/* No padding on the column itself: the loop translates by
                  exactly -50% of its own height, so any padding would break the
                  seam between the duplicated card sets. */}
              <div className="login-mq-col is-rev min-w-0 flex-1">
                {[...marqueeColB, ...marqueeColB].map((card, index) =>
                  renderMarqueeCard(card, `b-${index}`, "far"),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
