"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TelegramLoginButton from "@/components/auth/telegram-login-button";
import VkLoginButton from "@/components/auth/vk-login-button";
import { LegalConsentCheckbox } from "@/features/auth/components/LegalConsentCheckbox";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import { UI_TEXT } from "@/lib/ui/text";
import { FocalImage } from "@/components/ui/focal-image";

type LoginClientProps = {
  heroImageUrl: string | null;
  heroImageFocalX: number | null;
  heroImageFocalY: number | null;
};

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";

  // 8XXXXXXXXXX → +7XXXXXXXXXX
  if (digits.startsWith("8") && digits.length === 11) {
    return `+7${digits.slice(1)}`;
  }

  // 7XXXXXXXXXX → +7XXXXXXXXXX
  if (digits.startsWith("7") && digits.length === 11) {
    return `+${digits}`;
  }

  // уже с плюсом: +7XXXXXXXXXX
  if (input.trim().startsWith("+")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

function isPhoneValid(input: string): boolean {
  const normalized = normalizePhone(input);
  // Российский номер: +7 и ровно 10 цифр после
  return /^\+7\d{10}$/.test(normalized);
}

function safeNext(nextRaw: string | null) {
  if (!nextRaw) return null;
  if (!nextRaw.startsWith("/")) return null;
  if (nextRaw.startsWith("//")) return null;
  return nextRaw;
}

export default function LoginClient({
  heroImageUrl,
  heroImageFocalX,
  heroImageFocalY,
}: LoginClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const phoneValid = isPhoneValid(phone);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const previousOverflow = document.body.style.overflow;

    const applyOverflow = (matches: boolean) => {
      document.body.style.overflow = matches ? "hidden" : previousOverflow;
    };

    applyOverflow(media.matches);
    const onMediaChange = (event: MediaQueryListEvent) => applyOverflow(event.matches);
    media.addEventListener("change", onMediaChange);

    return () => {
      media.removeEventListener("change", onMediaChange);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function sendCode() {
    setErrorText(null);
    const normalized = normalizePhone(phone);

    if (!isPhoneValid(phone)) {
      setErrorText(UI_TEXT.auth.loginPage.invalidPhone);
      return;
    }

    if (!agreedToTerms) {
      setErrorText("Необходимо согласие с условиями и политикой конфиденциальности.");
      return;
    }

    setLoading(true);
    try {
      await fetchJson<Record<string, never>>("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      setStep("code");
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped = getErrorMessageByCode(error.code);
        setErrorText(mapped ?? error.message ?? UI_TEXT.auth.loginPage.sendCodeFailed);
      } else {
        setErrorText(UI_TEXT.auth.loginPage.sendCodeFailed);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setErrorText(null);
    const normalized = normalizePhone(phone);

    if (!code || code.length < 4) {
      setErrorText(UI_TEXT.auth.loginPage.enterCode);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ redirect: string }>("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, code }),
      });

      router.replace(nextPath ?? result.redirect);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped = getErrorMessageByCode(error.code);
        setErrorText(mapped ?? error.message ?? UI_TEXT.auth.loginPage.invalidCode);
      } else {
        setErrorText(UI_TEXT.auth.loginPage.invalidCode);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-background lg:fixed lg:left-0 lg:right-0 lg:top-[var(--topbar-h)] lg:z-20 lg:h-[calc(100dvh-var(--topbar-h))] lg:overflow-hidden">
      <div className="mx-auto grid h-full min-h-[100dvh] w-full max-w-6xl gap-10 px-4 py-6 lg:min-h-0 lg:grid-cols-[520px_1fr] lg:items-center lg:py-8">
        <aside className="relative hidden h-full max-h-[720px] min-h-0 max-w-[520px] overflow-hidden rounded-3xl border border-white/10 bg-white/5 lg:block">
          {heroImageUrl ? (
            <FocalImage
              src={heroImageUrl}
              alt=""
              focalX={heroImageFocalX}
              focalY={heroImageFocalY}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
          <div className="absolute bottom-10 left-8 right-8 text-white">
            <p className="text-3xl font-semibold leading-tight">{UI_TEXT.auth.loginPage.heroTitle}</p>
            <p className="mt-3 text-sm text-white/80">{UI_TEXT.auth.loginPage.heroSubtitle}</p>
          </div>
        </aside>

        <main className="flex h-full min-h-0 items-center justify-center lg:justify-start">
          <div className="w-full max-w-[420px] rounded-3xl border border-border/60 bg-card/90 p-6 shadow-sm sm:p-7">
            <div className="mb-7">
              <div className="text-sm font-semibold text-muted-foreground">МастерРядом</div>
              <h1 className="mt-2 text-2xl font-semibold">{UI_TEXT.auth.loginPage.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{UI_TEXT.auth.loginPage.subtitle}</p>
            </div>

            {errorText ? (
              <div
                aria-live="polite"
                className="mb-4 rounded-2xl border border-red-300/70 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
              >
                {errorText}
              </div>
            ) : null}

            {step === "phone" ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium">{UI_TEXT.auth.loginPage.phoneLabel}</label>
                <input
                  className="h-12 w-full rounded-2xl border border-border bg-background px-5 text-base outline-none transition focus:ring-2 focus:ring-primary/40"
                  placeholder="+7 (___) ___-__-__"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={UI_TEXT.auth.loginPage.phoneLabel}
                />

                {phoneValid ? (
                  <LegalConsentCheckbox
                    checked={agreedToTerms}
                    onCheckedChange={setAgreedToTerms}
                    variant="short"
                  />
                ) : null}

                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading || !phoneValid || (phoneValid && !agreedToTerms)}
                  className="h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
                >
                  {loading ? UI_TEXT.auth.loginPage.sending : UI_TEXT.auth.loginPage.sendCode}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {UI_TEXT.auth.loginPage.codeSentTo}{" "}
                  <span className="font-medium text-foreground">{normalizePhone(phone)}</span>
                </div>

                <label className="block text-sm font-medium">{UI_TEXT.auth.loginPage.codeLabel}</label>
                <input
                  className="h-12 w-full rounded-2xl border border-border bg-background px-5 text-base tracking-[0.15em] outline-none transition focus:ring-2 focus:ring-primary/40"
                  placeholder={UI_TEXT.auth.loginPage.codePlaceholder}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={UI_TEXT.auth.loginPage.codeLabel}
                />

                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={loading}
                  className="h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
                >
                  {loading ? UI_TEXT.auth.loginPage.verifying : UI_TEXT.auth.login}
                </button>

                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  disabled={loading}
                  className="h-11 w-full rounded-2xl border border-border bg-card text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
                >
                  {UI_TEXT.auth.loginPage.changePhone}
                </button>
              </div>
            )}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {UI_TEXT.auth.loginPage.or}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="text-sm font-medium">{UI_TEXT.auth.loginPage.telegramSectionTitle}</div>
              <TelegramLoginButton />
              <div className="pt-2 text-sm font-medium">{UI_TEXT.auth.loginPage.vkSectionTitle}</div>
              <VkLoginButton />
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">{UI_TEXT.auth.loginPage.noAccountHint}</p>

            {nextPath ? (
              <div className="mt-4 text-xs text-muted-foreground">
                {UI_TEXT.auth.loginPage.returnAfterLogin} <span className="font-mono">{nextPath}</span>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
