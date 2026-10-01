"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Notice } from "@/components/ui/notice";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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

  /**
   * FIX-C8 · fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ на обоих шагах.
   *
   * Здесь сходятся сразу три семейства действенных отказов, и ни одно из них
   * прежняя ветвящаяся раскладка не показывала верно:
   *
   *  1. **Занятость адреса** — `EMAIL_ALREADY_USED` 409 «Этот email уже
   *     используется другим аккаунтом. Укажите другой адрес.» (вторая половина
   *     инв. #41). Попадала в `else` и печаталась как «Не удалось отправить
   *     код. Попробуйте ещё раз.» — то есть пользователю предлагали повторить
   *     то, что не сработает никогда, вместо единственного действия, которое
   *     решает: ввести другой адрес.
   *  2. **Близнецы лимитера** — FIX-B12/FIX-B14 РАЗВЕЛИ на проводе 429
   *     `RATE_LIMITED` («слишком часто») и 503 `RATE_LIMIT_UNAVAILABLE` («не
   *     смогли посчитать — повторите»), потому что для человека это
   *     противоположные советы. Клиент знал только про `RATE_LIMITED`, а 503 и
   *     `OTP_LOCKED` проваливались в общий текст — различие, ради которого
   *     сервер и переделывали, до пользователя не доходило.
   *  3. **Отказ отправки** — `EMAIL_SEND_FAILED` 502 и `SYSTEM_FEATURE_DISABLED`
   *     503 несут собственные курируемые строки.
   *
   * 🔴 Ветвление по коду вдобавок ДУБЛИРОВАЛО серверную копирайт-строку на
   * клиенте («Слишком много запросов. Попробуйте позже.» слово в слово
   * повторяла `otp-rate-limit-response.ts`) — то есть правка текста на сервере
   * молча расходилась бы с экраном. Одна строка теперь живёт в одном месте.
   */
  async function requestOtp() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson("/api/cabinet/user/profile/email/request-verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setStep("code");
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
    } catch (caught) {
      setError(serverMessageOr(caught, T.sendFailed));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson("/api/cabinet/user/profile/email/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      onSuccess();
    } catch (caught) {
      setError(serverMessageOr(caught, T.verifyFailed));
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
                className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec"
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
                className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec"
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
              key={resendAt ?? "idle"}
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
  return <Notice tone="danger">{message}</Notice>;
}

function ResendRow({
  resendAt,
  onResend,
}: {
  resendAt: number | null;
  onResend: () => void;
}) {
  // LINT-BASELINE-SETSTATE-IN-EFFECT: seed the countdown once via a lazy
  // initializer, then refresh it from the interval with a DEFERRED setState
  // (allowed — the rule only flags a synchronous setState in the effect body;
  // the old code called `tick()`/`setSecondsLeft(0)` synchronously there).
  // The parent keys this row on `resendAt`, so a fresh cooldown remounts and
  // re-seeds the initial value — no stale first second. Behaviour identical.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    resendAt ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!resendAt) return;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);

  if (secondsLeft > 0) {
    return (
      <p className="text-xs text-text-sec">{T.resendIn(secondsLeft)}</p>
    );
  }
  return (
    <Button variant="wrapper" onClick={onResend} className="rounded text-xs text-accent-text hover:underline">
      {T.resend}
    </Button>
  );
}
