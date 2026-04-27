"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarCheck, Search } from "lucide-react";
import TelegramLoginButton from "@/components/auth/telegram-login-button";
import VkLoginButton from "@/components/auth/vk-login-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FocalImage } from "@/components/ui/focal-image";
import { LegalConsentCheckbox } from "@/features/auth/components/LegalConsentCheckbox";
import { cn } from "@/lib/cn";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import { UI_TEXT } from "@/lib/ui/text";

const RESEND_TIMEOUT = 60;
const OTP_LENGTH = 6;

type LoginMode = "phone" | "email";

type LoginClientProps = {
  heroImageUrl: string | null;
  emailEnabled?: boolean;
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

  // Focus the right slot when value changes
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
      className="flex w-full gap-2"
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
            "h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg-input text-center text-xl font-semibold tabular-nums text-text-main shadow-sm",
            "transition-all duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            value[i] ? "border-primary/40 bg-primary/5" : "",
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

export default function LoginClient({ heroImageUrl, emailEnabled = false }: LoginClientProps) {
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

  // Lock body scroll on desktop
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

  // Cleanup timer on unmount
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

  const heroFeatures = [
    { icon: <Search className="h-4 w-4" />, text: UI_TEXT.auth.loginPage.heroFeature1 },
    { icon: <CalendarCheck className="h-4 w-4" />, text: UI_TEXT.auth.loginPage.heroFeature2 },
    { icon: <Bell className="h-4 w-4" />, text: UI_TEXT.auth.loginPage.heroFeature3 },
  ];

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-background lg:fixed lg:left-0 lg:right-0 lg:top-[var(--topbar-h)] lg:z-20 lg:h-[calc(100dvh-var(--topbar-h))] lg:overflow-hidden">
      <div className="mx-auto grid h-full min-h-[100dvh] w-full max-w-6xl gap-10 px-4 py-6 lg:min-h-0 lg:grid-cols-[500px_1fr] lg:items-center lg:py-8">

        {/* ── LEFT PANEL (desktop only) ── */}
        <aside className="relative hidden h-full max-h-[720px] min-h-0 max-w-[500px] overflow-hidden rounded-3xl lg:block">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-accent/85" />

          {/* Ambient blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-12 -top-12 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-8 -right-8 h-56 w-56 rounded-full bg-accent/40 blur-3xl" />
            <div className="absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-white/5 blur-2xl" />
          </div>

          {/* Optional hero photo overlay */}
          {heroImageUrl ? (
            <FocalImage
              src={heroImageUrl}
              alt=""
              sizes="(max-width: 1200px) 50vw, 500px"
              className="object-cover opacity-20"
            />
          ) : null}

          {/* Bottom gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

          {/* Content */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            className="relative flex h-full flex-col justify-between p-10"
          >
            {/* Brand name */}
            <motion.div variants={panelItemVariants}>
              <span className="text-sm font-semibold tracking-wide text-white/60">
                {UI_TEXT.brand.name}
              </span>
            </motion.div>

            {/* Middle: headline + features */}
            <div className="space-y-7">
              <motion.h2
                variants={panelItemVariants}
                className="text-[1.9rem] font-bold leading-tight tracking-tight text-white"
              >
                {UI_TEXT.auth.loginPage.heroTitle}
              </motion.h2>

              <ul className="space-y-4">
                {heroFeatures.map((feature, i) => (
                  <motion.li
                    key={i}
                    variants={panelItemVariants}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                      {feature.icon}
                    </div>
                    <span className="text-sm font-medium leading-snug text-white/88">
                      {feature.text}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Social proof */}
            <motion.div variants={panelItemVariants} className="flex items-end gap-7">
              <div>
                <div className="text-[1.6rem] font-bold tabular-nums text-white">
                  {UI_TEXT.auth.loginPage.socialProofMasters}
                </div>
                <div className="mt-0.5 text-xs leading-tight text-white/60">
                  {UI_TEXT.auth.loginPage.socialProofMastersLabel}
                </div>
              </div>
              <div className="mb-2 h-6 w-px bg-white/20" />
              <div>
                <div className="text-[1.6rem] font-bold tabular-nums text-white">
                  {UI_TEXT.auth.loginPage.socialProofBookings}
                </div>
                <div className="mt-0.5 text-xs leading-tight text-white/60">
                  {UI_TEXT.auth.loginPage.socialProofBookingsLabel}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </aside>

        {/* ── RIGHT PANEL ── */}
        <main className="flex h-full min-h-0 items-center justify-center lg:justify-start">
          <div className="w-full max-w-[420px]">

            {/* Mobile brand hint */}
            <div className="mb-5 lg:hidden">
              <p className="text-sm font-semibold text-muted-foreground">{UI_TEXT.brand.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground/75">
                {UI_TEXT.auth.loginPage.heroSubtitle}
              </p>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/90 p-6 shadow-sm sm:p-7">

              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-foreground">
                  {UI_TEXT.auth.loginPage.title}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {UI_TEXT.auth.loginPage.subtitle}
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
                    className="animate-shake mb-4 rounded-2xl border border-red-300/70 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
                  >
                    {errorText}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Mode tabs (phone / email) — shown only on input step */}
              {emailEnabled && step === "input" ? (
                <div className="mb-5 flex rounded-2xl border border-border-subtle/60 bg-bg-input/50 p-1">
                  {(["phone", "email"] as LoginMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={cn(
                        "flex-1 rounded-xl py-1.5 text-sm font-medium transition-all duration-150",
                        mode === m
                          ? "bg-bg-card text-text-main shadow-sm"
                          : "text-text-sec hover:text-text-main"
                      )}
                    >
                      {m === "phone" ? UI_TEXT.auth.loginPage.tabPhone : UI_TEXT.auth.loginPage.tabEmail}
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
                        <label htmlFor="phone-input" className="block text-sm font-medium">
                          {UI_TEXT.auth.loginPage.phoneLabel}
                        </label>
                        <Input
                          id="phone-input"
                          className="h-12 px-5 text-base"
                          placeholder={UI_TEXT.auth.loginPage.phonePlaceholderMask}
                          value={phone}
                          onChange={(ev) => setPhone(ev.target.value)}
                          inputMode="tel"
                          autoComplete="tel"
                          aria-label={UI_TEXT.auth.loginPage.phoneLabel}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label htmlFor="email-input" className="block text-sm font-medium">
                          {UI_TEXT.auth.loginPage.emailLabel}
                        </label>
                        <Input
                          id="email-input"
                          className="h-12 px-5 text-base"
                          placeholder={UI_TEXT.auth.loginPage.emailPlaceholder}
                          value={email}
                          onChange={(ev) => setEmail(ev.target.value)}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          aria-label={UI_TEXT.auth.loginPage.emailLabel}
                        />
                      </div>
                    )}

                    {inputValid ? (
                      <LegalConsentCheckbox
                        checked={agreedToTerms}
                        onCheckedChange={setAgreedToTerms}
                        variant="short"
                      />
                    ) : null}

                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={sendCode}
                        disabled={loading || !inputValid || (inputValid && !agreedToTerms)}
                        size="lg"
                        className="w-full"
                      >
                        {loading ? UI_TEXT.auth.loginPage.sending : UI_TEXT.auth.loginPage.sendCode}
                      </Button>
                    </motion.div>
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
                    {/* Identifier display */}
                    <div className="rounded-2xl border border-border-subtle/60 bg-bg-input/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        {mode === "email" ? UI_TEXT.auth.loginPage.codeSentToEmail : UI_TEXT.auth.loginPage.codeSentTo}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {mode === "phone" ? normalizePhone(phone) : email.trim().toLowerCase()}
                      </p>
                    </div>

                    {/* OTP inputs */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium">
                        {mode === "email" ? UI_TEXT.auth.loginPage.codeFromEmail : UI_TEXT.auth.loginPage.codeLabel}
                      </label>
                      <OtpInput
                        value={code}
                        onChange={setCode}
                        onComplete={verifyCode}
                        disabled={loading}
                        autoFocus
                      />
                    </div>

                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={() => verifyCode()}
                        disabled={loading || code.length < OTP_LENGTH}
                        size="lg"
                        className="w-full"
                      >
                        {loading ? UI_TEXT.auth.loginPage.verifying : UI_TEXT.auth.login}
                      </Button>
                    </motion.div>

                    {/* Resend + change identifier row */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={goBackToInput}
                        disabled={loading}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                      >
                        {mode === "email" ? UI_TEXT.auth.loginPage.changeEmail : UI_TEXT.auth.loginPage.changePhoneNumber}
                      </button>

                      {resendTimer > 0 ? (
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {UI_TEXT.auth.loginPage.resendCodeTimer}{" "}
                          <span className="font-medium text-foreground">{resendTimer}</span>{" "}
                          {UI_TEXT.auth.loginPage.resendCodeSeconds}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={resendCode}
                          disabled={loading}
                          className="text-sm font-medium text-primary transition-colors hover:text-primary-hover disabled:pointer-events-none disabled:opacity-50"
                        >
                          {UI_TEXT.auth.loginPage.resendCode}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold tracking-wider text-muted-foreground">
                  {UI_TEXT.auth.loginPage.or}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Social login */}
              <div className="space-y-3">
                <TelegramLoginButton showConfigError={false} />
                <VkLoginButton />
              </div>

              {/* Bottom hint */}
              <p className="mt-5 text-center text-xs text-muted-foreground">
                {UI_TEXT.auth.loginPage.noAccountHint}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
