"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.clientCabinet.profilePage.emailVerify;

type Props = {
  currentEmail: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

const RESEND_COOLDOWN_MS = 60_000;

/**
 * Two-step modal: type email → send OTP → enter 6-digit code → verify.
 * Backend reuses the email-login OTP infra; this surface only sets the
 * `emailVerifiedAt` flag and doesn't rotate the session.
 */
export function EmailVerifyModal({ currentEmail, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(currentEmail ?? "");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);

  async function requestOtp() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/cabinet/user/profile/email/request-verify",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const code = json?.error?.code;
        if (code === "RATE_LIMITED") {
          setError("Слишком много запросов. Попробуйте позже.");
        } else if (code === "SYSTEM_FEATURE_DISABLED") {
          setError("Email временно недоступен. Попробуйте позже.");
        } else {
          setError(T.sendFailed);
        }
        return;
      }
      setStep("code");
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
    } catch {
      setError(T.sendFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/user/profile/email/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const errCode = json?.error?.code;
        if (errCode === "CODE_NOT_FOUND") {
          setError(T.invalidCode);
        } else if (errCode === "RATE_LIMITED") {
          setError("Слишком много попыток. Подождите.");
        } else {
          setError(T.verifyFailed);
        }
        return;
      }
      onSuccess();
    } catch {
      setError(T.verifyFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const emailValid = email.trim().length > 0 && email.includes("@");

  return (
    <ModalSurface open onClose={onClose} title={T.modalTitle}>
      <div className="space-y-4">
        {step === "email" ? (
          <>
            <p className="text-sm text-text-sec">{T.modalDescription}</p>
            <div className="space-y-1.5">
              <label
                htmlFor="email-verify-input"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
              >
                {T.emailLabel}
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
                  aria-hidden
                />
                <Input
                  id="email-verify-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
            {error ? <ErrorBox message={error} /> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
              >
                {UI_TEXT.common.cancel}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={requestOtp}
                disabled={!emailValid || submitting}
              >
                {submitting ? "Отправляем…" : T.sendCode}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-sec">
              Код отправлен на <b className="text-text-main">{email}</b>.
              Проверьте почту и папку «Спам».
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="email-code-input"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
              >
                {T.codeLabel}
              </label>
              <Input
                id="email-code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                className="text-center font-mono text-2xl tracking-[0.4em]"
                autoFocus
              />
              <p className="text-xs text-text-sec">{T.codeHint}</p>
            </div>
            {error ? <ErrorBox message={error} /> : null}
            <ResendRow
              resendAt={resendAt}
              onResend={() => {
                setCode("");
                setError(null);
                void requestOtp();
              }}
            />
            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                disabled={submitting}
              >
                ← Изменить email
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={verifyOtp}
                disabled={code.length !== 6 || submitting}
              >
                {submitting ? "Проверяем…" : T.confirm}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalSurface>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-300/50 bg-rose-50/60 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
      {message}
    </div>
  );
}

function ResendRow({
  resendAt,
  onResend,
}: {
  resendAt: number | null;
  onResend: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!resendAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);

  if (secondsLeft > 0) {
    return (
      <p className="text-xs text-text-sec">{T.resendIn(secondsLeft)}</p>
    );
  }
  return (
    <button
      type="button"
      onClick={onResend}
      className="text-xs text-primary hover:underline"
    >
      {T.resend}
    </button>
  );
}
