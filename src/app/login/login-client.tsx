"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ChevronLeft,
  Images,
  Mail,
  Phone,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import TelegramLoginButton from "@/components/auth/telegram-login-button";
import VkLoginButton from "@/components/auth/vk-login-button";
import YandexLoginButton from "@/components/auth/yandex-login-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { ResilientImage } from "@/components/ui/resilient-image";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { LegalConsentCheckbox } from "@/features/auth/components/LegalConsentCheckbox";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import type { PublicStats } from "@/lib/stats/public-stats";
import { UI_TEXT } from "@/lib/ui/text";

const RESEND_TIMEOUT = 60;
const OTP_LENGTH = 6;

type LoginMode = "phone" | "email";

type LoginClientProps = {
  heroImageUrl: string | null;
  emailEnabled?: boolean;
  stats?: PublicStats | null;
  // QA-001: resolved server-side in page.tsx and passed down so the social
  // buttons render the same branch on server + client (no hydration mismatch).
  telegramBotUsername?: string;
  // FIX-TELEGRAM-KILLSWITCH: effective Telegram flag (resolved server-side).
  // When false the Telegram login button is omitted entirely.
  telegramEnabled?: boolean;
  vkEnabled?: boolean;
  // FIX-YANDEX-OAUTH: server-resolved Yandex-enabled flag (button absent when false).
  yandexEnabled?: boolean;
};

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8") && digits.length === 11) return `+7${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 11) return `+${digits}`;
  if (input.trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

function isPhoneValid(input: string): boolean {
  return /^\+7\d{10}$/.test(normalizePhone(input));
}

function isEmailValid(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  if (!nextRaw.startsWith("/")) return null;
  if (nextRaw.startsWith("//")) return null;
  return nextRaw;
}

function formatStatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return new Intl.NumberFormat("ru-RU").format(value);
}

// ---------- Animation variants (framer-motion — enter / stagger / step) ----------

const panelVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.2 },
  },
};

const panelItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

const stepVariants = {
  enter: { opacity: 0, x: 22 },
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    x: -16,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
  },
};

// Marquee benefit cards — visual device only. Copy lives in UI_TEXT; the icons
// are paired here by index (icons are not UI text). No invented person, quote
// or rating (LOGIN-REDESIGN-01 marquee decision).
const MARQUEE_ICONS: LucideIcon[] = [Zap, Wallet, Images, BellRing, CalendarClock, ShieldCheck];

// ---------- Main component ----------

export default function LoginClient({
  heroImageUrl,
  emailEnabled = false,
  stats = null,
  telegramBotUsername,
  telegramEnabled = false,
  vkEnabled,
  yandexEnabled = false,
}: LoginClientProps) {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);
  // FIX-23: the Telegram widget now uses redirect mode (`data-auth-url`) to
  // avoid the CSP `unsafe-eval`; auth failures bounce back here with
  // `?error=telegram`, surfaced once on mount via the initial error state.
  const initialTelegramError = useMemo(
    () =>
      (searchParams.get("error") ?? "").startsWith("telegram")
        ? UI_TEXT.auth.telegram.loginFailed
        : null,
    [searchParams],
  );
  const reduce = useReducedMotion();
  const panelAnim = reduce ? undefined : panelVariants;
  const panelItemAnim = reduce ? undefined : panelItemVariants;
  const stepAnim = reduce ? undefined : stepVariants;

  const [mode, setMode] = useState<LoginMode>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"input" | "code">("input");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(initialTelegramError);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);

  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const auroraRef = useRef<HTMLDivElement | null>(null);
  const phoneValid = isPhoneValid(phone);
  const emailValid = isEmailValid(email);
  const inputValid = mode === "phone" ? phoneValid : emailValid;

  // Lock body scroll on desktop only (left panel is fixed-height there)
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const previousOverflow = document.body.style.overflow;
    const apply = (matches: boolean) => {
      document.body.style.overflow = matches ? "hidden" : previousOverflow;
    };
    apply(media.matches);
    const onChange = (ev: MediaQueryListEvent) => apply(ev.matches);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);

  function startResendTimer() {
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    setResendTimer(RESEND_TIMEOUT);
    resendIntervalRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(resendIntervalRef.current!);
          resendIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function triggerShake() {
    setShakeKey((k) => k + 1);
  }

  function switchMode(newMode: LoginMode) {
    if (newMode === mode) return;
    setMode(newMode);
    setStep("input");
    setPhone("");
    setEmail("");
    setCode("");
    setErrorText(null);
  }

  // Cursor parallax on the aurora — decorative, honours reduced-motion.
  function handlePaneMouseMove(event: React.MouseEvent<HTMLElement>) {
    if (reduce) return;
    const pane = paneRef.current;
    const aurora = auroraRef.current;
    if (!pane || !aurora) return;
    const rect = pane.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    aurora.style.transform = `translate(${x * 26}px, ${y * 22}px)`;
  }

  function handlePaneMouseLeave() {
    if (auroraRef.current) auroraRef.current.style.transform = "";
  }

  async function requestPhoneOtp(normalized: string): Promise<void> {
    await fetchJson<Record<string, never>>("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalized }),
    });
  }

  async function requestEmailOtp(normalizedEmail: string): Promise<void> {
    await fetchJson<Record<string, never>>("/api/auth/otp/email/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
  }

  async function sendCode() {
    setErrorText(null);
    if (mode === "phone") {
      if (!isPhoneValid(phone)) {
        setErrorText(UI_TEXT.auth.loginPage.invalidPhone);
        triggerShake();
        return;
      }
      if (!agreedToTerms) {
        setErrorText(UI_TEXT.auth.loginPage.consentRequired);
        triggerShake();
        return;
      }
      setLoading(true);
      try {
        await requestPhoneOtp(normalizePhone(phone));
        setCode("");
        setStep("code");
        startResendTimer();
      } catch (error) {
        const msg =
          error instanceof ApiClientError
            ? (getErrorMessageByCode(error.code) ?? error.message ?? UI_TEXT.auth.loginPage.sendCodeFailed)
            : UI_TEXT.auth.loginPage.sendCodeFailed;
        setErrorText(msg);
        triggerShake();
      } finally {
        setLoading(false);
      }
    } else {
      if (!isEmailValid(email)) {
        setErrorText(UI_TEXT.auth.loginPage.invalidEmail);
        triggerShake();
        return;
      }
      if (!agreedToTerms) {
        setErrorText(UI_TEXT.auth.loginPage.consentRequired);
        triggerShake();
        return;
      }
      setLoading(true);
      try {
        await requestEmailOtp(email.trim().toLowerCase());
        setCode("");
        setStep("code");
        startResendTimer();
      } catch (error) {
        const msg =
          error instanceof ApiClientError
            ? (getErrorMessageByCode(error.code) ?? error.message ?? UI_TEXT.auth.loginPage.sendCodeEmailFailed)
            : UI_TEXT.auth.loginPage.sendCodeEmailFailed;
        setErrorText(msg);
        triggerShake();
      } finally {
        setLoading(false);
      }
    }
  }

  async function verifyCode(codeValue?: string) {
    const finalCode = codeValue ?? code;
    setErrorText(null);
    if (finalCode.length < OTP_LENGTH) {
      setErrorText(UI_TEXT.auth.loginPage.enterCode);
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const body =
        mode === "phone"
          ? { phone: normalizePhone(phone), code: finalCode }
          : { email: email.trim().toLowerCase(), code: finalCode };
      const endpoint = mode === "phone" ? "/api/auth/otp/verify" : "/api/auth/otp/email/verify";
      const result = await fetchJson<{ redirect: string }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      window.location.replace(nextPath ?? result.redirect);
    } catch (error) {
      const msg =
        error instanceof ApiClientError
          ? (getErrorMessageByCode(error.code) ?? error.message ?? UI_TEXT.auth.loginPage.invalidCode)
          : UI_TEXT.auth.loginPage.invalidCode;
      setErrorText(msg);
      triggerShake();
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resendTimer > 0) return;
    setErrorText(null);
    setCode("");
    setLoading(true);
    try {
      if (mode === "phone") {
        await requestPhoneOtp(normalizePhone(phone));
      } else {
        await requestEmailOtp(email.trim().toLowerCase());
      }
      startResendTimer();
    } catch (error) {
      const fallback = mode === "phone" ? UI_TEXT.auth.loginPage.sendCodeFailed : UI_TEXT.auth.loginPage.sendCodeEmailFailed;
      const msg =
        error instanceof ApiClientError
          ? (getErrorMessageByCode(error.code) ?? error.message ?? fallback)
          : fallback;
      setErrorText(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  function goBackToInput() {
    setStep("input");
    setCode("");
    setErrorText(null);
  }

  const T = UI_TEXT.auth.loginPage;

  const marqueeCards = T.marquee.map((card, index) => ({
    ...card,
    Icon: MARQUEE_ICONS[index % MARQUEE_ICONS.length],
  }));
  const marqueeColA = marqueeCards.slice(0, 3);
  const marqueeColB = marqueeCards.slice(3, 6);

  const renderMarqueeCard = (
    card: (typeof marqueeCards)[number],
    key: string,
  ) => {
    const Icon = card.Icon;
    return (
      <div
        key={key}
        className="flex-none rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-gradient text-white ring-1 ring-white/20">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{card.title}</div>
            <div className="truncate text-[11px] text-white/60">{card.subtitle}</div>
          </div>
          {card.badge ? (
            <span className="ml-auto flex-none rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/75">
              {card.badge}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  // Shine sweep injected into the CTA — the `Button`'s own focus ring is a
  // box-shadow, so the button's `overflow-hidden` clips only this child, never
  // the ring. Fixed-light highlight on the fixed burgundy gradient (both themes).
  const ctaShine = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
    />
  );

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-bg-page lg:fixed lg:left-0 lg:right-0 lg:top-[var(--topbar-h)] lg:z-20 lg:h-[calc(100dvh-var(--topbar-h))] lg:overflow-hidden">
      <div className="mx-auto grid h-full min-h-[100dvh] w-full max-w-6xl gap-8 px-4 py-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch lg:gap-10 lg:py-8">

        {/* ── LEFT PANEL — brand stage (desktop only) ── */}
        <aside
          ref={paneRef}
          onMouseMove={handlePaneMouseMove}
          onMouseLeave={handlePaneMouseLeave}
          className="login-grain login-sheen relative isolate hidden h-full max-h-[760px] min-h-0 flex-col overflow-hidden rounded-3xl bg-brand-pane text-white lg:flex"
        >
          {/* Layered animated aurora (parallax target) */}
          <div ref={auroraRef} className="login-aurora" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>

          {/* Twinkling sparkles */}
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

          {/* Optional hero photo overlay */}
          {heroImageUrl ? (
            <ResilientImage
              src={heroImageUrl}
              alt=""
              sizes="(max-width: 1200px) 50vw, 600px"
              className="object-cover opacity-15"
            />
          ) : null}

          {/* Content */}
          <motion.div
            variants={panelAnim}
            initial="hidden"
            animate="visible"
            className="relative z-[2] flex h-full flex-col justify-between p-10"
          >
            {/* Brand block — gradient iconmark + white wordmark over the dark
                stage. `textClassName="text-white"` overrides the wordmark's
                gradient text-clip so it stays readable on the burgundy backdrop;
                the iconmark keeps its gradient for brand identity (proven
                legible on this pane pre-redesign). */}
            <motion.div variants={panelItemAnim}>
              <BrandLogo variant="full" size="md" href={null} textClassName="text-white" />
              <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-white/60">
                {UI_TEXT.brand.tagline}
              </p>
            </motion.div>

            {/* Badge + headline + subtitle */}
            <div className="py-6">
              {stats ? (
                <motion.div
                  variants={panelItemAnim}
                  className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[12.5px] backdrop-blur-md"
                >
                  <span className="login-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  <span className="tabular-nums">
                    {formatStatNumber(stats.masters)} {T.socialProofMastersLabel}
                  </span>
                </motion.div>
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

              <motion.p
                variants={panelItemAnim}
                className="mt-5 max-w-md text-[15px] leading-relaxed text-white/80"
              >
                {T.brandTagline}
              </motion.p>
            </div>

            {/* Marquee of benefit cards */}
            <motion.div
              variants={panelItemAnim}
              className="login-mq-zone relative flex h-[224px] gap-4 overflow-hidden"
              style={{
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)",
                maskImage:
                  "linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)",
              }}
              aria-hidden
            >
              <div className="login-mq-col flex-1">
                {[...marqueeColA, ...marqueeColA].map((card, index) =>
                  renderMarqueeCard(card, `a-${index}`),
                )}
              </div>
              <div className="login-mq-col is-rev flex-1">
                {[...marqueeColB, ...marqueeColB].map((card, index) =>
                  renderMarqueeCard(card, `b-${index}`),
                )}
              </div>
            </motion.div>
          </motion.div>
        </aside>

        {/* ── RIGHT PANEL — form ── */}
        {/* `lg:overflow-hidden` clips the decorative halo to this pane on desktop
            (where the layout is fixed-height); on mobile there is no clip and no
            halo, so a tall form step can never be cut off — the outer container
            scrolls instead. */}
        <main className="relative flex h-full min-h-0 items-center justify-center lg:overflow-hidden">
          <div className="login-halo hidden lg:block" aria-hidden />
          <div className="relative z-[1] w-full max-w-[400px]">

            {/* Mobile brand hint — compact full BrandLogo + tagline. */}
            <div className="mb-6 lg:hidden">
              <BrandLogo variant="full" size="sm" href={null} />
              <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-text-sec">
                {UI_TEXT.brand.tagline}
              </p>
            </div>

            {/* Header */}
            <div className="mb-6">
              <h1 className="font-display text-[1.75rem] font-medium tracking-tight text-text-main">
                {step === "input" ? T.title : T.codeSentTo}
              </h1>
              <p className="mt-1.5 text-sm text-text-sec">
                {step === "input"
                  ? T.subtitle
                  : (
                    <span>
                      {mode === "email" ? T.codeSentToEmail : T.codeSentTo}{" "}
                      <span className="font-medium text-text-main">
                        {mode === "phone" ? normalizePhone(phone) : email.trim().toLowerCase()}
                      </span>
                    </span>
                  )}
              </p>
            </div>

            {/* Error block */}
            <AnimatePresence mode="wait">
              {errorText ? (
                <motion.div
                  key={`error-${shakeKey}`}
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.18 }}
                  role="alert"
                  aria-live="polite"
                  className="mb-4 rounded-2xl border border-red-300/70 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
                >
                  {errorText}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Mode tabs (only on input step + email enabled) */}
            {emailEnabled && step === "input" ? (
              <SegmentedTabs<LoginMode>
                value={mode}
                onChange={switchMode}
                className="mb-5"
                options={[
                  {
                    value: "phone",
                    label: T.tabPhone,
                    icon: <Phone className="h-3.5 w-3.5" aria-hidden />,
                    testId: "login-tab-phone",
                  },
                  {
                    value: "email",
                    label: T.tabEmail,
                    icon: <Mail className="h-3.5 w-3.5" aria-hidden />,
                    testId: "login-tab-email",
                  },
                ]}
              />
            ) : null}

            {/* Form steps */}
            <AnimatePresence mode="wait">
              {step === "input" ? (
                <motion.div
                  key={`input-step-${mode}`}
                  variants={stepAnim}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  {mode === "phone" ? (
                    <div className="space-y-1.5">
                      <label htmlFor="phone-input" className="block text-sm font-medium text-text-label">
                        {T.phoneLabel}
                      </label>
                      <div className="group/field relative transition-transform duration-200 focus-within:-translate-y-0.5">
                        <Phone
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec transition-[color,transform] duration-200 group-focus-within/field:scale-110 group-focus-within/field:text-primary"
                          aria-hidden
                        />
                        <Input
                          id="phone-input"
                          className="h-[52px] rounded-2xl pl-10 pr-4 text-base"
                          placeholder={T.phonePlaceholderMask}
                          value={phone}
                          onChange={(ev) => setPhone(ev.target.value)}
                          inputMode="tel"
                          autoComplete="tel"
                          aria-label={T.phoneLabel}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label htmlFor="email-input" className="block text-sm font-medium text-text-label">
                        {T.emailLabel}
                      </label>
                      <div className="group/field relative transition-transform duration-200 focus-within:-translate-y-0.5">
                        <Mail
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec transition-[color,transform] duration-200 group-focus-within/field:scale-110 group-focus-within/field:text-primary"
                          aria-hidden
                        />
                        <Input
                          id="email-input"
                          className="h-[52px] rounded-2xl pl-10 pr-4 text-base"
                          placeholder={T.emailPlaceholder}
                          value={email}
                          onChange={(ev) => setEmail(ev.target.value)}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          aria-label={T.emailLabel}
                        />
                      </div>
                    </div>
                  )}

                  {inputValid ? (
                    <LegalConsentCheckbox
                      checked={agreedToTerms}
                      onCheckedChange={setAgreedToTerms}
                      variant="short"
                    />
                  ) : null}

                  <Button
                    onClick={sendCode}
                    disabled={loading || !inputValid || (inputValid && !agreedToTerms)}
                    size="lg"
                    data-testid="login-send-code"
                    className="group relative w-full overflow-hidden rounded-full"
                  >
                    {loading ? (
                      T.sending
                    ) : (
                      <>
                        {ctaShine}
                        {T.sendCode}
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                      </>
                    )}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="otp-step"
                  variants={stepAnim}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-text-label">
                      {mode === "email" ? T.codeFromEmail : T.codeLabel}
                    </label>
                    <OtpInput
                      value={code}
                      onChange={setCode}
                      onComplete={verifyCode}
                      disabled={loading}
                      length={OTP_LENGTH}
                      groupLabel={T.codeLabel}
                      shakeSignal={shakeKey}
                      autoFocus
                    />
                  </div>

                  <Button
                    onClick={() => verifyCode()}
                    disabled={loading || code.length < OTP_LENGTH}
                    size="lg"
                    data-testid="login-verify"
                    className="group relative w-full overflow-hidden rounded-full"
                  >
                    {loading ? (
                      T.verifying
                    ) : (
                      <>
                        {ctaShine}
                        {UI_TEXT.auth.login}
                        <Check className="h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={goBackToInput}
                      disabled={loading}
                      data-testid="login-back"
                      className="inline-flex items-center gap-1 text-sm text-text-sec transition-colors hover:text-text-main disabled:pointer-events-none disabled:opacity-50"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      {mode === "email" ? T.changeEmail : T.changePhoneNumber}
                    </button>

                    {resendTimer > 0 ? (
                      <span className="text-sm tabular-nums text-text-sec">
                        {T.resendCodeTimer}{" "}
                        <span className="font-medium text-text-main">{resendTimer}</span>{" "}
                        {T.resendCodeSeconds}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={resendCode}
                        disabled={loading}
                        data-testid="login-resend"
                        className="text-sm font-medium text-accent-text transition-colors hover:text-primary-hover disabled:pointer-events-none disabled:opacity-50"
                      >
                        {T.resendCode}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border-subtle" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-sec">
                {T.socialDividerLabel}
              </span>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>

            {/* Social login — grid columns adapt to the number of enabled
                providers (Telegram gated by FIX-TELEGRAM-KILLSWITCH; VK + Yandex
                self-gate). Launch config = VK + Yandex → 2 columns. */}
            <div
              className={`grid gap-2.5${
                [telegramEnabled, vkEnabled, yandexEnabled].filter(Boolean).length >= 3
                  ? " sm:grid-cols-3"
                  : [telegramEnabled, vkEnabled, yandexEnabled].filter(Boolean).length === 2
                    ? " sm:grid-cols-2"
                    : ""
              }`}
            >
              {telegramEnabled && (
                <TelegramLoginButton showConfigError={false} botUsername={telegramBotUsername} />
              )}
              <VkLoginButton enabled={vkEnabled} />
              <YandexLoginButton enabled={yandexEnabled} />
            </div>

            {/* Bottom hint */}
            <p className="mt-5 text-center text-xs leading-relaxed text-text-sec">
              {T.noAccountHint}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
