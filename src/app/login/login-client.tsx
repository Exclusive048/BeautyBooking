"use client";

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, Mail, Phone } from "lucide-react";
import { withConsentQuery } from "@/components/auth/social-consent";
import TelegramLoginButton from "@/components/auth/telegram-login-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput, type OtpState } from "@/components/ui/otp-input";
import { LegalConsentGroup } from "@/features/auth/components/legal-consent-group";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import { parseInternalPath } from "@/lib/http/safe-redirect";
import {
  consentFlagsToQuery,
  EMPTY_CONSENT_FLAGS,
  hasRequiredConsents,
  type ConsentFlags,
} from "@/lib/legal/consent-flags";
import type { PublicStats } from "@/lib/stats/public-stats";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { LoginShowcase } from "./login-showcase";
import {
  ChannelTile,
  OAuthTile,
  tileGridColumns,
  type OAuthProvider,
  type OtpChannel,
} from "./login-method-tiles";
import { UI_FMT } from "@/lib/ui/fmt";

const RESEND_TIMEOUT = 60;
const OTP_LENGTH = 6;

/**
 * How long the success beat holds before the redirect fires (LOGIN-WOW-01).
 * The cascade itself runs 6 × 45 ms + 220 ms ≈ 490 ms, but it starts the moment
 * the server answers and the redirect does not wait for it to finish — this is
 * the *artificial* part of the delay and is deliberately kept under the ~400 ms
 * budget. Reduced motion drops it to zero.
 */
const SUCCESS_HOLD_MS = 380;

/**
 * LOGIN-TILES-01 — как долго плитка VK ID / Яндекс ID крутит спиннер, если
 * браузер так и не ушёл к провайдеру (нет сети, переход отменён). Возврат
 * кнопкой «Назад» снимает спиннер раньше — через `pageshow`.
 */
const OAUTH_PENDING_RESET_MS = 15_000;

/** Фокус в поле после раскрытия панели — когда раскрытие (380 мс) почти закончилось. */
const PANEL_FOCUS_DELAY_MS = 250;

type LoginMode = OtpChannel;

type LoginClientProps = {
  heroImageUrl: string | null;
  // AUTH-GATE-01: server-resolved `isPhoneAuthEnabled`. False → the phone tab
  // and phone field are absent and the form opens on email. Passed as a prop
  // (never imported here) because PHONE_AUTH_ENABLED is server-only — reading
  // it in this bundle would resolve to a different value than the server used
  // and desync hydration.
  phoneEnabled?: boolean;
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

// Post-login landing target. Delegates to the shared origin-resolving validator
// (SECURITY-EXPOSURE-AUDIT-01 · O1) — the old "starts with `/`, not `//`" check
// let `/\evil` and TAB-spliced forms through to window.location.replace. Returns
// null for an invalid target so the caller falls back to the server's redirect.
function safeNext(nextRaw: string | null) {
  return parseInternalPath(nextRaw);
}

// ---------- Animation variants (framer-motion — enter / step) ----------

const stepVariants = {
  enter: { opacity: 0, x: DISTANCE.rise },
  center: {
    opacity: 1,
    x: 0,
    transition: MOTION.base,
  },
  exit: {
    opacity: 0,
    x: -DISTANCE.rise,
    transition: MOTION.exit,
  },
};

// ---------- Main component ----------

export default function LoginClient({
  heroImageUrl,
  phoneEnabled = true,
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
  // RKN-FIX-01 adds `?error=consent`: an OAuth callback bounced the visitor
  // back because the consent captured at `/start` was missing or expired by the
  // time the provider returned. Re-prompting is the fail-safe — an account is
  // never created without provable consent.
  const initialError = useMemo(() => {
    const code = searchParams.get("error") ?? "";
    if (code.startsWith("telegram")) return UI_TEXT.auth.telegram.loginFailed;
    if (code === "consent") return UI_TEXT.auth.loginPage.consentExpired;
    // FIX-B5: колбэк VK/Яндекса вернул конфликт уникальности адреса.
    if (code === "email_taken") return UI_TEXT.auth.loginPage.emailTakenByAnotherAccount;
    // FIX-B13: провайдер не ответил за 10 с. Единственный отказ колбэка, где
    // «попробуйте ещё раз» — не отговорка: причина внешняя и преходящая.
    if (code === "provider_timeout") return UI_TEXT.auth.loginPage.oauthProviderTimeout;
    // FIX-B14: исходы СТАРТОВОЙ ноги (`OAuthStartFailure`). Раньше они уезжали
    // JSON-конвертом прямо в окно браузера — вернуться было некуда. Ключ
    // запроса и есть имя исхода, см. `lib/auth/oauth-start-error.ts`.
    if (code === "provider_unavailable") return UI_TEXT.auth.loginPage.oauthProviderUnavailable;
    if (code === "consent_required") return UI_TEXT.auth.loginPage.consentRequired;
    if (code === "start_failed") return UI_TEXT.auth.loginPage.oauthStartFailed;
    return null;
  }, [searchParams]);
  // Вернулись с OAuth без согласий — блок согласий сразу в состоянии «отметьте».
  const initialConsentWarn = useMemo(() => {
    const code = searchParams.get("error");
    return code === "consent" || code === "consent_required";
  }, [searchParams]);
  const reduce = useReducedMotion();
  const stepAnim = stepVariants;

  // AUTH-GATE-01: the panel opens on whichever OTP channel is actually
  // available. LOGIN-TILES-01: email first — it is the channel that works in
  // production without an SMS gateway; `mode` only matters once a tile opened
  // the panel.
  const [mode, setMode] = useState<LoginMode>(emailEnabled ? "email" : "phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"input" | "code">("input");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(initialError);
  // RKN-FIX-01: three independent purposes, none pre-ticked (a pre-checked box
  // is void consent). Required = terms + pdProcessing; marketing never gates.
  const [consent, setConsent] = useState<ConsentFlags>(EMPTY_CONSENT_FLAGS);
  const requiredConsentsGiven = hasRequiredConsents(consent);
  // What the social buttons need: whether they may fire at all, and the flags
  // to hand to `/api/auth/*/start` (which re-validates them server-side).
  const socialConsent = useMemo(
    () => ({ granted: requiredConsentsGiven, query: consentFlagsToQuery(consent) }),
    [consent, requiredConsentsGiven],
  );
  // LOGIN-TILES-01: способ входа нажат без обязательных согласий — блок
  // согласий подсвечен и вздрагивает, под ним подсказка. Снимается, как только
  // обе обязательные галочки стоят.
  const [consentWarn, setConsentWarn] = useState(initialConsentWarn);
  const [consentShake, setConsentShake] = useState(0);
  const consentWarnVisible = consentWarn && !requiredConsentsGiven;
  const consentHintId = useId();
  const panelId = useId();
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  // LOGIN-WOW-01: the OTP grid's own lifecycle. Purely presentational — the
  // auth calls below drive it, never the other way round.
  const [otpState, setOtpState] = useState<OtpState>("idle");

  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnOpenRef = useRef(false);
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

  // AUTH-GATE-01: at least one OTP channel must be live for the code panel to
  // make sense. With neither (VK/Yandex-only config) only the provider tiles
  // are rendered.
  const otpEnabled = phoneEnabled || emailEnabled;
  const hasSocialProviders = Boolean(telegramEnabled || vkEnabled || yandexEnabled);
  // LOGIN-TILES-01: order matters — the OTP tiles come last, so with four
  // tiles in two rows the open panel sits right under the selected one.
  const methods: Array<OAuthProvider | OtpChannel> = [
    ...(vkEnabled ? (["vk"] as const) : []),
    ...(yandexEnabled ? (["yandex"] as const) : []),
    ...(emailEnabled ? (["email"] as const) : []),
    ...(phoneEnabled ? (["phone"] as const) : []),
  ];
  // A single OTP channel and nothing else to choose: no reason to make the
  // visitor open the only door — the panel starts open.
  const [panelOpen, setPanelOpen] = useState(
    otpEnabled && !hasSocialProviders && !(phoneEnabled && emailEnabled),
  );

  useEffect(() => {
    if (!panelOpen || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    const timer = window.setTimeout(
      () => inputRef.current?.focus({ preventScroll: true }),
      reduce ? 0 : PANEL_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [panelOpen, mode, reduce]);

  // Back/forward cache returns the page exactly as it was left — with the
  // spinner still spinning on the provider tile.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPendingProvider(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!pendingProvider) return;
    const timer = window.setTimeout(() => setPendingProvider(null), OAUTH_PENDING_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [pendingProvider]);

  function warnConsents() {
    setConsentWarn(true);
    setConsentShake((k) => k + 1);
  }

  function handleConsentChange(next: ConsentFlags) {
    setConsent(next);
    if (hasRequiredConsents(next)) setConsentWarn(false);
  }

  function toggleChannel(channel: OtpChannel) {
    if (panelOpen && mode === channel) {
      setPanelOpen(false);
      return;
    }
    switchMode(channel);
    focusOnOpenRef.current = true;
    setPanelOpen(true);
  }

  function startOAuth(provider: OAuthProvider, event: MouseEvent<HTMLAnchorElement>) {
    if (pendingProvider) {
      event.preventDefault();
      return;
    }
    if (!requiredConsentsGiven) {
      event.preventDefault();
      warnConsents();
      return;
    }
    // Ctrl/Cmd/Shift-click opens a new tab — this page stays where it is.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    setErrorText(null);
    setPendingProvider(provider);
  }

  function switchMode(newMode: LoginMode) {
    if (newMode === mode) return;
    // Guard the gated channel even if a stale tab somehow fires.
    if (newMode === "phone" && !phoneEnabled) return;
    if (newMode === "email" && !emailEnabled) return;
    setMode(newMode);
    setStep("input");
    setPhone("");
    setEmail("");
    setCode("");
    setErrorText(null);
    setOtpState("idle");
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
      if (!requiredConsentsGiven) {
        warnConsents();
        return;
      }
      setLoading(true);
      try {
        await requestPhoneOtp(normalizePhone(phone));
        setCode("");
        setOtpState("idle");
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
      if (!requiredConsentsGiven) {
        warnConsents();
        return;
      }
      setLoading(true);
      try {
        await requestEmailOtp(email.trim().toLowerCase());
        setCode("");
        setOtpState("idle");
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
      setOtpState("error");
      return;
    }
    setLoading(true);
    setOtpState("verifying");
    try {
      // RKN-FIX-01: the ticked boxes travel with the request that creates the
      // account. The server re-checks them (UI gating alone proves nothing) and
      // records one UserConsent row per granted purpose.
      const body =
        mode === "phone"
          ? { phone: normalizePhone(phone), code: finalCode, consent }
          : { email: email.trim().toLowerCase(), code: finalCode, consent };
      const endpoint = mode === "phone" ? "/api/auth/otp/verify" : "/api/auth/otp/email/verify";
      const result = await fetchJson<{ redirect: string }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const target = nextPath ?? result.redirect;
      setOtpState("success");
      // The navigation is scheduled on a plain timer and is NEVER chained to an
      // animation callback: if the success cascade were dropped (reduced
      // motion, a stalled rAF, a low-end device throttling frames) the user
      // would otherwise be stranded on a form that already logged them in.
      // `loading` stays true through the beat so the form is inert meanwhile.
      window.setTimeout(
        () => {
          // Полная загрузка, а не роутер: новая сессия должна дойти до серверной
          // шапки корневого layout — мягкая навигация её не перерисует.
          window.location.replace(target);
        },
        reduce ? 0 : SUCCESS_HOLD_MS,
      );
    } catch (error) {
      // `CODE_NOT_FOUND` is what BOTH verify routes return for a wrong *or*
      // expired code, and its server message is the English string "Code not
      // found" — which this handler was passing straight through to a Russian
      // UI on the product's front door (it is not in `getErrorMessageByCode`'s
      // map, so `error.message` won). The curated string wins for that code.
      const msg =
        error instanceof ApiClientError
          ? error.code === "CODE_NOT_FOUND"
            ? UI_TEXT.auth.loginPage.invalidCode
            : (getErrorMessageByCode(error.code) ?? error.message ?? UI_TEXT.auth.loginPage.invalidCode)
          : UI_TEXT.auth.loginPage.invalidCode;
      setErrorText(msg);
      triggerShake();
      setCode("");
      setOtpState("error");
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resendTimer > 0) return;
    setErrorText(null);
    setCode("");
    setOtpState("idle");
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
    setOtpState("idle");
  }

  const T = UI_TEXT.auth.loginPage;

  // Shine sweep injected into the CTA — the `Button`'s own focus ring is a
  // box-shadow, so the button's `overflow-hidden` clips only this child, never
  // the ring. Fixed-light highlight on the fixed burgundy gradient (both themes).
  const ctaShine = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-500 ease-brand group-hover:translate-x-full motion-reduce:hidden"
    />
  );

  // LOGIN-TILES-01: на телефоне страница — обычная прокрутка (шапка, форма,
  // футер сайта), а колонка формы занимает первый экран целиком, чтобы строка
  // «Без пароля…» стояла внизу экрана, как в макете. Отступ 3rem/5rem — это
  // `py-6` / `md:py-10` обёртки `AppShellContent`. На ПК — прежняя
  // фиксированная сцена во всю высоту под шапкой.
  return (
    <div className="bg-bg-page lg:fixed lg:left-0 lg:right-0 lg:top-[var(--topbar-h)] lg:z-sticky lg:h-[calc(100dvh-var(--topbar-h))] lg:overflow-hidden">
      {/* LOGIN-WOW-01 — `lg:items-center`, not `items-stretch`: the brand pane
          is capped at `max-h-[760px]`, and a stretch item that cannot stretch
          falls back to START alignment. On any viewport taller than the cap
          that parked the pane at the top of the row with dead space beneath it,
          while the form column centred itself — which is exactly the
          off-centre reading. Centring the row aligns both columns on one axis. */}
      <div className="mx-auto grid min-h-[calc(100dvh-var(--topbar-h)-3rem)] w-full max-w-6xl gap-8 px-1 md:min-h-[calc(100dvh-var(--topbar-h)-5rem)] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:px-4 lg:py-8">

        {/* ── LEFT PANEL — brand stage (desktop only) ── */}
        <LoginShowcase heroImageUrl={heroImageUrl} stats={stats} />

        {/* ── RIGHT PANEL — form ── */}
        {/* `lg:overflow-hidden` clips the decorative halo to this pane on desktop
            (where the layout is fixed-height); on mobile there is no clip and no
            halo, so a tall form step can never be cut off. */}
        <main className="relative flex min-h-0 flex-col lg:h-full lg:items-center lg:justify-center lg:overflow-hidden">
          <div className="login-halo hidden lg:block" aria-hidden />
          {/* Deliberately NOT wrapped in an entrance animation. A framer
              `initial` is serialised into the SSR HTML as `opacity:0`, so an
              entrance here would leave the login form invisible until
              hydration finishes — on the product's front door that trades a
              first impression for a blank screen. The form's motion language
              is interaction-driven instead: step transitions, the panel
              reveal, the CTA shine and the OTP choreography. */}
          <div className="relative z-1 mx-auto flex w-full max-w-[400px] flex-1 flex-col lg:flex-none">

            {/* Mobile brand row — logo + live-stat chip. The brand stage itself
                stays desktop-only (it is decorative and would push the form
                below the fold). LOGIN-TILES-01: the tagline under the logo is
                gone — the owner's layout keeps only the logo and the chip. */}
            <div className="mb-5 flex flex-col items-start gap-4 lg:hidden">
              {/* `bg-wordmark`: the wordmark's default brand-gradient text-clip
                  is burgundy in BOTH themes, so on the dark page (#1F1417) its
                  tail («…дом») sank into the background. The token keeps the
                  gradient in light and fills a legible cream in dark
                  (`--wordmark-fill`, 29.09 доработки · 23). */}
              <BrandLogo variant="full" size="sm" href={null} textClassName="bg-wordmark" />
              {stats ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-3 py-1.5 text-xs text-text-sec">
                  <span className="login-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  <span className="tabular-nums">
                    {UI_FMT.countShort(stats.masters)} {T.socialProofMastersLabel}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Header. Знак рядом с «МастерРядом» — только на десктопе: на
                телефоне логотип и так стоит строкой выше (brand row). Следует
                за темой, как в шапке (`LogoMark`, BRAND-ICONS-03). */}
            <div className="mb-5">
              <h1 className="flex items-center gap-3 font-display text-[2rem] font-medium leading-[1.1] tracking-tight text-text-main">
                {step === "input" ? T.titleLogin : T.codeStepTitle}
                {step === "input" ? <LogoMark size={40} className="hidden lg:inline-block" /> : null}
              </h1>
              {step === "code" ? (
                <p className="mt-2 text-sm text-text-sec">
                  {mode === "email" ? T.codeSentToEmail : T.codeSentTo}{" "}
                  <span className="font-medium text-text-main">
                    {mode === "phone" ? normalizePhone(phone) : email.trim().toLowerCase()}
                  </span>
                </p>
              ) : null}
            </div>

            {/* Error block */}
            <AnimatePresence mode="wait">
              {errorText ? (
                <m.div
                  key={`error-${shakeKey}`}
                  initial={{ opacity: 0, y: -DISTANCE.nudge }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -DISTANCE.nudge }}
                  transition={MOTION.micro}
                  role="alert"
                  aria-live="polite"
                  className="mb-4 rounded-2xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text"
                >
                  {errorText}
                </m.div>
              ) : null}
            </AnimatePresence>

            {/* Steps. `initial={false}`: the step variants' `enter` state
                (opacity 0) was being serialised into the SSR HTML, so the very
                first paint of the form was invisible until hydration.
                Suppressing only the MOUNT animation keeps every real step
                transition (input↔code) animating exactly as before. */}
            <AnimatePresence mode="wait" initial={false}>
              {step === "input" ? (
                <m.div
                  key="input-step"
                  variants={stepAnim}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {/* RKN-FIX-01: one consent block for every method — each of
                      them can create an account. LOGIN-TILES-01: a method
                      pressed without the required boxes lights the block up,
                      shakes it and shows the hint under it. */}
                  <LegalConsentGroup
                    value={consent}
                    onChange={handleConsentChange}
                    invalid={consentWarnVisible}
                    describedBy={consentWarnVisible ? consentHintId : undefined}
                    shakeSignal={consentShake}
                  />
                  <div className="login-reveal" data-open={consentWarnVisible}>
                    <div>
                      {/* Visual copy; the announcement comes from the live
                          region below, so this one stays out of the tree. */}
                      <p id={consentHintId} aria-hidden className="mt-2 px-1 text-xs text-danger-text">
                        {T.consentHint}
                      </p>
                    </div>
                  </div>
                  <span className="sr-only" role="alert">
                    {consentWarnVisible ? T.consentHint : ""}
                  </span>

                  {methods.length > 0 ? (
                    <div
                      role="group"
                      aria-label={T.methodsLabel}
                      className={`mt-3 grid gap-2.5 ${tileGridColumns(methods.length)}`}
                    >
                      {methods.map((method) => {
                        if (method === "vk" || method === "yandex") {
                          return (
                            <OAuthTile
                              key={method}
                              provider={method}
                              // RKN-FIX-01: the ticked purposes ride to `/start`,
                              // which re-validates them server-side.
                              href={withConsentQuery(
                                method === "vk" ? "/api/auth/vk/start" : "/api/auth/yandex/start",
                                socialConsent,
                              )}
                              label={method === "vk" ? T.tileVk : T.tileYandex}
                              pending={pendingProvider === method}
                              onClick={(event) => startOAuth(method, event)}
                              testId={`login-oauth-${method}`}
                            />
                          );
                        }
                        return (
                          <ChannelTile
                            key={method}
                            channel={method}
                            label={method === "email" ? T.tileEmail : T.tilePhone}
                            selected={panelOpen && mode === method}
                            panelId={panelId}
                            onClick={() => toggleChannel(method)}
                            testId={`login-tab-${method}`}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                  <span className="sr-only" role="status" aria-live="polite">
                    {pendingProvider ? T.oauthRedirecting : ""}
                  </span>

                  {/* The code request panel — opened by the Почта / Телефон
                      tile. Closed, its content is `visibility: hidden`
                      (`.login-reveal`), i.e. out of the tab order. */}
                  {otpEnabled ? (
                    <div id={panelId} className="login-reveal" data-open={panelOpen}>
                      <div>
                        <form
                          noValidate
                          onSubmit={(event) => {
                            event.preventDefault();
                            void sendCode();
                          }}
                          className="relative mt-2.5 space-y-2.5 rounded-2xl border border-primary-magenta bg-bg-card p-3"
                        >
                          <div className="group/field relative">
                            {mode === "phone" ? (
                              <Phone
                                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec transition-colors duration-200 group-focus-within/field:text-accent-text"
                                aria-hidden
                              />
                            ) : (
                              <Mail
                                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec transition-colors duration-200 group-focus-within/field:text-accent-text"
                                aria-hidden
                              />
                            )}
                            {mode === "phone" ? (
                              <Input
                                ref={inputRef}
                                id="phone-input"
                                className="h-[50px] rounded-xl pl-10 pr-4 text-base"
                                placeholder={T.phonePlaceholderMask}
                                value={phone}
                                onChange={(ev) => setPhone(ev.target.value)}
                                inputMode="tel"
                                autoComplete="tel"
                                aria-label={T.phoneLabel}
                              />
                            ) : (
                              <Input
                                ref={inputRef}
                                id="email-input"
                                className="h-[50px] rounded-xl pl-10 pr-4 text-base"
                                placeholder={T.emailPlaceholder}
                                value={email}
                                onChange={(ev) => setEmail(ev.target.value)}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                aria-label={T.emailLabel}
                              />
                            )}
                          </div>

                          {/* Disabled only for an incomplete address/number.
                              Missing consents are not a disabled state: the
                              press is what shows WHAT is missing (the consent
                              block lights up), a greyed button explains nothing. */}
                          <Button
                            type="submit"
                            disabled={loading || !inputValid}
                            size="lg"
                            data-testid="login-send-code"
                            className="group relative w-full overflow-hidden rounded-xl"
                          >
                            {loading ? (
                              T.sending
                            ) : (
                              <>
                                {ctaShine}
                                {T.getCode}
                                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                              </>
                            )}
                          </Button>
                        </form>
                      </div>
                    </div>
                  ) : null}

                  {/* Telegram stays a full-width button: its login is a widget
                      callback, not a redirect a tile could start
                      (FIX-TELEGRAM-KILLSWITCH keeps it off in production). */}
                  {telegramEnabled ? (
                    <div className="mt-2.5">
                      <TelegramLoginButton
                        showConfigError={false}
                        botUsername={telegramBotUsername}
                        consent={socialConsent}
                      />
                    </div>
                  ) : null}
                </m.div>
              ) : (
                <m.div
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
                      onChange={(next) => {
                        setCode(next);
                        // Typing after a rejection clears the error colour but
                        // leaves the message until the next verify answers.
                        if (otpState === "error") setOtpState("idle");
                      }}
                      onComplete={verifyCode}
                      disabled={loading}
                      length={OTP_LENGTH}
                      groupLabel={T.codeLabel}
                      shakeSignal={shakeKey}
                      state={otpState}
                      autoFocus
                    />
                  </div>

                  {/* The success confirmation is a colour sweep on the grid —
                      invisible to a screen reader, hence the live region. */}
                  <span className="sr-only" role="status" aria-live="polite">
                    {otpState === "success" ? T.codeAccepted : ""}
                  </span>

                  <Button
                    onClick={() => verifyCode()}
                    disabled={loading || code.length < OTP_LENGTH}
                    size="lg"
                    data-testid="login-verify"
                    className="group relative w-full overflow-hidden rounded-xl"
                  >
                    {otpState === "success" ? (
                      <m.span
                        className="inline-flex items-center gap-2"
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={MOTION.base}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        {T.codeAccepted}
                      </m.span>
                    ) : loading ? (
                      T.verifying
                    ) : (
                      <>
                        {ctaShine}
                        {UI_TEXT.nav.login}
                        <Check className="h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="wrapper"
                      onClick={goBackToInput}
                      disabled={loading}
                      data-testid="login-back"
                      className="inline-flex items-center gap-1 text-sm text-text-sec transition-colors hover:text-text-main disabled:pointer-events-none disabled:opacity-50"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      {mode === "email" ? T.changeEmail : T.changePhoneNumber}
                    </Button>

                    {resendTimer > 0 ? (
                      <span className="text-sm tabular-nums text-text-sec">
                        {T.resendCodeTimer}{" "}
                        <span className="font-medium text-text-main">{resendTimer}</span>{" "}
                        {T.resendCodeSeconds}
                      </span>
                    ) : (
                      <Button variant="wrapper"
                        onClick={resendCode}
                        disabled={loading}
                        data-testid="login-resend"
                        className="text-sm font-medium text-accent-text transition-colors hover:text-accent-text-hover disabled:pointer-events-none disabled:opacity-50"
                      >
                        {T.resendCode}
                      </Button>
                    )}
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Bottom hint — pinned to the bottom of the first screen on a
                phone (`mt-auto` in the full-height column), right under the
                form on desktop. */}
            <p className="mt-auto pt-8 text-center text-xs leading-relaxed text-text-sec lg:mt-0 lg:pt-6">
              {T.noAccountHint}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
