"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, Mail, Phone } from "lucide-react";
import TelegramLoginButton from "@/components/auth/telegram-login-button";
import VkLoginButton from "@/components/auth/vk-login-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FocalImage } from "@/components/ui/focal-image";
import { LegalConsentCheckbox } from "@/features/auth/components/LegalConsentCheckbox";
import { cn } from "@/lib/cn";
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

// ---------- OTP digit input ----------

type OtpInputProps = {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length >= OTP_LENGTH) {
      refs.current[OTP_LENGTH - 1]?.focus();
    } else {
      refs.current[value.length]?.focus();
    }
  }, [value]);

  function handleChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const chars = value.split("").slice(0, OTP_LENGTH);
    chars[index] = digit;
    const next = chars.join("").slice(0, OTP_LENGTH);
    onChange(next);
    if (next.length === OTP_LENGTH) {
      onComplete?.(next);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        const chars = value.split("");
        chars[index] = "";
        onChange(chars.join(""));
      } else if (index > 0) {
        const chars = value.split("");
        chars[index - 1] = "";
        onChange(chars.join(""));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === OTP_LENGTH) {
      onComplete?.(pasted);
    }
  }

  return (
    <div
      className="grid w-full grid-cols-6 gap-1.5 sm:gap-2"
      role="group"
      aria-label={UI_TEXT.auth.loginPage.codeLabel}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={2}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Цифра ${i + 1} из ${OTP_LENGTH}`}
          className={cn(
            "h-12 min-w-0 rounded-xl border bg-bg-card text-center text-lg font-semibold tabular-nums text-text-main shadow-sm sm:h-14 sm:text-xl",
            "transition-all duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            value[i] ? "border-primary bg-primary/5" : "border-border-subtle",
          )}
        />
      ))}
    </div>
  );
}

// ---------- Animation variants ----------

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

// ---------- Main component ----------

export default function LoginClient({ heroImageUrl, emailEnabled = false, stats = null }: LoginClientProps) {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

  const [mode, setMode] = useState<LoginMode>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"input" | "code">("input");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);

  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-bg-page lg:fixed lg:left-0 lg:right-0 lg:top-[var(--topbar-h)] lg:z-20 lg:h-[calc(100dvh-var(--topbar-h))] lg:overflow-hidden">
      <div className="mx-auto grid h-full min-h-[100dvh] w-full max-w-6xl gap-8 px-4 py-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch lg:gap-10 lg:py-8">

        {/* ── LEFT PANEL — brand (desktop only) ── */}
        <aside className="relative hidden h-full max-h-[760px] min-h-0 overflow-hidden rounded-3xl bg-brand-gradient text-white lg:block">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 20% 30%, rgba(254,198,211,0.18), transparent 50%), radial-gradient(circle at 80% 70%, rgba(186,212,237,0.14), transparent 50%)",
              }}
            />
            {/* Diagonal stripes overlay */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 80px)",
              }}
            />
          </div>

          {/* Optional hero photo overlay */}
          {heroImageUrl ? (
            <FocalImage
              src={heroImageUrl}
              alt=""
              sizes="(max-width: 1200px) 50vw, 600px"
              className="object-cover opacity-15"
            />
          ) : null}

          {/* Bottom darken */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

          {/* Content */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            className="relative flex h-full flex-col justify-between p-10"
          >
            {/* Brand block */}
            <motion.div variants={panelItemVariants} className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-xl font-bold tracking-tight backdrop-blur-md"
                aria-hidden
              >
                М
              </div>
              <div>
                <div className="text-base font-bold tracking-tight">{UI_TEXT.brand.name}</div>
                <div className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-white/70">
                  {T.brandSubtitle}
                </div>
              </div>
            </motion.div>

            {/* Headline + sub */}
            <div className="space-y-5">
              <motion.h2
                variants={panelItemVariants}
                className="text-balance text-[2.4rem] font-bold leading-[1.05] tracking-tight xl:text-[3rem]"
              >
                {T.heroTitle}{" "}
                <em className="font-medium italic text-white/90">{T.heroTitleAccent}</em>
              </motion.h2>

              <motion.p
                variants={panelItemVariants}
                className="max-w-md text-base leading-relaxed text-white/82"
              >
                {T.heroSubtitle}
              </motion.p>
            </div>

            {/* Stats (only if API returned data) */}
            {stats ? (
              <motion.div variants={panelItemVariants} className="flex items-end gap-6">
                <div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-white">
                    {formatStatNumber(stats.masters)}
                  </div>
                  <div className="mt-0.5 text-xs leading-tight text-white/70">
                    {T.socialProofMastersLabel}
                  </div>
                </div>
                <div className="mb-2 h-6 w-px bg-white/20" />
                <div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-white">
                    {formatStatNumber(stats.bookings)}
                  </div>
                  <div className="mt-0.5 text-xs leading-tight text-white/70">
                    {T.socialProofBookingsLabel}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div variants={panelItemVariants} aria-hidden />
            )}
          </motion.div>
        </aside>

        {/* ── RIGHT PANEL — form ── */}
        <main className="flex h-full min-h-0 items-center justify-center">
          <div className="w-full max-w-[400px]">

            {/* Mobile brand hint */}
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-base font-bold text-white"
                aria-hidden
              >
                М
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-main">{UI_TEXT.brand.name}</p>
                <p className="truncate font-mono text-[10px] tracking-[0.08em] text-text-sec">
                  {T.brandSubtitle}
                </p>
              </div>
            </div>

            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-text-main sm:text-[1.75rem]">
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
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  role="alert"
                  aria-live="polite"
                  className="animate-shake mb-4 rounded-xl border border-red-300/70 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
                >
                  {errorText}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Mode tabs (only on input step + email enabled) */}
            {emailEnabled && step === "input" ? (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {(["phone", "email"] as LoginMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150",
                      mode === m
                        ? "bg-bg-card text-text-main shadow-sm"
                        : "text-text-sec hover:text-text-main",
                    )}
                  >
                    {m === "phone" ? (
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {m === "phone" ? T.tabPhone : T.tabEmail}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Form steps */}
            <AnimatePresence mode="wait">
              {step === "input" ? (
                <motion.div
                  key={`input-step-${mode}`}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  {mode === "phone" ? (
                    <div className="space-y-1.5">
                      <label htmlFor="phone-input" className="block text-sm font-medium text-text-main">
                        {T.phoneLabel}
                      </label>
                      <div className="relative">
                        <Phone
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
                          aria-hidden
                        />
                        <Input
                          id="phone-input"
                          className="h-12 pl-9 pr-4 text-base"
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
                      <label htmlFor="email-input" className="block text-sm font-medium text-text-main">
                        {T.emailLabel}
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
                          aria-hidden
                        />
                        <Input
                          id="email-input"
                          className="h-12 pl-9 pr-4 text-base"
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
                    className="w-full"
                  >
                    {loading ? T.sending : (
                      <>
                        {T.sendCode}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="otp-step"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-text-main">
                      {mode === "email" ? T.codeFromEmail : T.codeLabel}
                    </label>
                    <OtpInput
                      value={code}
                      onChange={setCode}
                      onComplete={verifyCode}
                      disabled={loading}
                      autoFocus
                    />
                  </div>

                  <Button
                    onClick={() => verifyCode()}
                    disabled={loading || code.length < OTP_LENGTH}
                    size="lg"
                    className="w-full"
                  >
                    {loading ? T.verifying : (
                      <>
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
                        className="text-sm font-medium text-primary transition-colors hover:text-primary-hover disabled:pointer-events-none disabled:opacity-50"
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
              <span className="text-xs font-medium uppercase tracking-wider text-text-sec">
                {T.or}
              </span>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>

            {/* Social login — 1-col on small, 2-col from sm: */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <TelegramLoginButton showConfigError={false} />
              <VkLoginButton />
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
