import type { NextResponse } from "next/server";
import type { AccountType } from "@prisma/client";
import { OtpChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import {
  isAppReviewLoginEmail,
  logAppReviewLogin,
  matchesAppReviewLoginCode,
} from "@/lib/auth/app-review-login";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { findVerifiedEmailProfile, resolveEmailLoginProfile } from "@/lib/auth/email-login-profile";
import { hashOtpCode } from "@/lib/auth/otp";
import {
  checkOtpEmailVerifyLock,
  checkOtpVerifyLock,
  clearOtpEmailVerifyFailures,
  clearOtpVerifyFailures,
  registerOtpEmailVerifyFailure,
  registerOtpVerifyFailure,
} from "@/lib/auth/otp-rate-limit";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { classifyPhoneLoginTarget, isPhoneLoginRegistration, PHONE_LOGIN_PROFILE_SELECT } from "@/lib/auth/phone-claim";
import { resolvePhoneLoginProfile } from "@/lib/auth/phone-login-profile";
import { otpEmailVerifySchema, otpVerifySchema } from "@/lib/auth/schemas";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { linkGuestBookingsToUserByPhone } from "@/lib/bookings/link-guest-bookings";
import { isPhoneAuthEnabled } from "@/lib/env";
import { extractClientIp } from "@/lib/http/ip";
import { hasRequiredConsents } from "@/lib/legal/consent-flags";
import { recordUserConsents } from "@/lib/legal/consent";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { invalidateMeIdentityCache } from "@/lib/users/me";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * MOBILE-AUTH-A — вход по одноразовому коду, общий для веба и приложения.
 *
 * До пакета логика жила прямо в двух веб-роутах (`/api/auth/otp/verify`,
 * `/api/auth/otp/email/verify`). Мобильные роуты обязаны вести себя ТАК ЖЕ —
 * те же отказы (`CODE_NOT_FOUND` 401, `CONSENT_REQUIRED` 400, `OTP_LOCKED` 429,
 * `SYSTEM_FEATURE_DISABLED` 503, `EMAIL_NOT_VERIFIED`), тот же порядок «решение
 * о регистрации ДО сжигания кода» (RKN-FIX-01), те же побочные эффекты
 * (гостевые брони, согласия, бесплатная подписка). Копия разошлась бы с
 * оригиналом при первой же правке гейта согласий, поэтому здесь — всё до
 * момента выдачи сессии, а транспорт сессии (куки или токены в теле) решает
 * роут.
 *
 * Отказ возвращается готовым ответом (`fail()` / `otpRateLimitFail`), а не
 * исключением: роуты отдают его как есть, ровно как отдавали до выноса.
 */

export type OtpLoginProfile = {
  id: string;
  phone: string | null;
  roles: AccountType[];
};

export type OtpLoginChannel = "phone" | "email";

export type OtpLoginResult =
  | { ok: true; profile: OtpLoginProfile; redirect: string | null; startedAt: number }
  | { ok: false; response: NextResponse };

type OtpLoginOptions = {
  /** Веб уводит в кабинет по роли; приложению адрес не нужен. */
  resolveRedirect: boolean;
};

export async function verifyPhoneOtpLogin(req: Request, options: OtpLoginOptions): Promise<OtpLoginResult> {
  // AUTH-GATE-01: gating `/request` alone is not enough — unused OtpCode rows
  // issued before the flag was flipped stay valid for 5 minutes, and this is
  // the endpoint that actually mints a session. Refuse here too, before any
  // lookup, so phone auth cannot issue NEW sessions while it is off.
  // Session VALIDATION, refresh and logout are deliberately untouched:
  // everyone already signed in stays signed in.
  if (!isPhoneAuthEnabled) {
    return { ok: false, response: fail("Вход по телефону временно недоступен.", 503, "SYSTEM_FEATURE_DISABLED") };
  }

  const startedAt = Date.now();
  const body = await req.json().catch(() => null);
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR") };
  }
  const { phone, code, consent } = parsed.data;

  // O2: verify lockout is scoped by (phone + client IP) so a third party who
  // knows the number can't lock the owner out. Resolved once, up front.
  const clientIp = extractClientIp(req);

  const lockCheck = await checkOtpVerifyLock(phone, clientIp);
  if (!lockCheck.ok) {
    return { ok: false, response: otpRateLimitFail(lockCheck) };
  }

  const now = new Date();
  const codeHash = hashOtpCode(phone, code);

  const otp = await prisma.otpCode.findFirst({
    where: {
      phone,
      codeHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    const failResult = await registerOtpVerifyFailure(phone, clientIp);
    if (!failResult.ok) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "otp-verify",
        code: failResult.error ?? "OTP_VERIFY_LOCKED",
      });
      return { ok: false, response: otpRateLimitFail(failResult) };
    }
    void recordSurfaceEvent({
      surface: "auth",
      outcome: "failure",
      operation: "otp-verify",
      code: "CODE_NOT_FOUND",
    });
    return { ok: false, response: fail("Код не найден или истёк.", 401, "CODE_NOT_FOUND") };
  }

  const verifyDbStartedAt = Date.now();
  // RKN-FIX-01: the "is this a registration?" answer is needed BEFORE the
  // code is burned — refusing a first-time login for missing consent must not
  // cost the user their one-time code. So this lookup is pulled out of the
  // side-effect batch below and awaited first.
  //
  // PHONE-CLAIM-01: «строка с этим номером существует» больше НЕ означает
  // «пользователь вернулся» — номер может быть кабинетной ЗАЯВКОЙ чужого
  // аккаунта (FOREIGN_CLAIM), и тогда доказавший владение получит СВЕЖИЙ
  // профиль, то есть это регистрация со всеми согласиями. Триаж один на оба
  // вопроса (гейт согласий + чей профиль) — `classifyPhoneLoginTarget`.
  const existingProfile = await prisma.userProfile.findUnique({
    where: { phone },
    select: PHONE_LOGIN_PROFILE_SELECT,
  });
  const loginTarget = await classifyPhoneLoginTarget(existingProfile);

  // Server-side enforcement, not just UI gating: creating an account without
  // consent to the offer AND to PD processing is exactly what 152-ФЗ ст. 9
  // (ред. 156-ФЗ) forbids. Existing users are never blocked — their consent
  // is already on record and a login is not a new registration.
  if (isPhoneLoginRegistration(loginTarget) && !hasRequiredConsents(consent)) {
    void recordSurfaceEvent({
      surface: "auth",
      outcome: "denied",
      operation: "otp-verify",
      code: "CONSENT_REQUIRED",
    });
    return { ok: false, response: fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED") };
  }

  await Promise.all([
    clearOtpVerifyFailures(phone, clientIp),
    prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: now },
    }),
  ]);

  // OTP-PHONE-LOGIN-RACE: create-or-recover is delegated so a P2002 from two
  // simultaneous first-time logins re-reads the winner's row instead of
  // erroring (7th re-read-on-conflict site — see phone-login-profile.ts).
  const profile = await resolvePhoneLoginProfile(phone, loginTarget);
  logInfo("OTP verify primary DB queries done", {
    userProfileId: profile.id,
    ms: Date.now() - verifyDbStartedAt,
  });

  const ipAddress = clientIp;
  const userAgent = req.headers.get("user-agent");

  const sideEffectsStartedAt = Date.now();
  const linkBookingsPromise = profile.phone
    ? linkGuestBookingsToUserByPhone({ userProfileId: profile.id, phoneRaw: profile.phone }).catch((error) => {
        logError("linkGuestBookingsToUserByPhone failed after otp verify", {
          userProfileId: profile.id,
          error: error instanceof Error ? error.stack : error,
        });
      })
    : Promise.resolve();
  // RKN-FIX-01: one writer for every path, versions from the legal source of
  // truth, no row spam on repeat logins (see `recordUserConsents`). Nothing
  // is written when the client sent no flags — an unticked box must never
  // materialise as consent.
  const consentPromise = consent
    ? recordUserConsents({ userId: profile.id, flags: consent, ipAddress, userAgent })
    : Promise.resolve();

  const redirectDecision = options.resolveRedirect ? await resolveCabinetRedirect(profile.id) : null;
  await Promise.all([linkBookingsPromise, consentPromise]);
  logInfo("OTP verify side effects done", {
    userProfileId: profile.id,
    ms: Date.now() - sideEffectsStartedAt,
  });

  return {
    ok: true,
    profile: { id: profile.id, phone: profile.phone ?? null, roles: profile.roles },
    redirect: redirectDecision?.target ?? null,
    startedAt,
  };
}

export async function verifyEmailOtpLogin(req: Request, options: OtpLoginOptions): Promise<OtpLoginResult> {
  const startedAt = Date.now();
  const body = await req.json().catch(() => null);
  const parsed = otpEmailVerifySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR") };
  }

  const { email, code, consent } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // O2: scope verify lockout by (email + client IP) — see otp-rate-limit.ts.
  const clientIp = extractClientIp(req);

  const lockCheck = await checkOtpEmailVerifyLock(normalizedEmail, clientIp);
  if (!lockCheck.ok) {
    return { ok: false, response: otpRateLimitFail(lockCheck) };
  }

  const now = new Date();

  // MOBILE-POLISH: вход для App Review — для адреса `APP_REVIEW_LOGIN_EMAIL`
  // подходит только постоянный код из env (сравнение за постоянное время),
  // кодов в базе у этого адреса нет (запрос их не создаёт). Блокировка выше и
  // счётчик неверных попыток ниже — те же, что у всех.
  const appReview = isAppReviewLoginEmail(normalizedEmail);
  const appReviewCodeOk = appReview && matchesAppReviewLoginCode(normalizedEmail, code);
  if (appReview) logAppReviewLogin("verify", appReviewCodeOk ? "accepted" : "rejected");

  const otp = appReview
    ? null
    : await prisma.otpCode.findFirst({
        where: {
          email: normalizedEmail,
          channel: OtpChannel.EMAIL,
          codeHash: hashOtpCode(normalizedEmail, code),
          usedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

  if (!otp && !appReviewCodeOk) {
    const failResult = await registerOtpEmailVerifyFailure(normalizedEmail, clientIp);
    if (!failResult.ok) {
      void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: failResult.error ?? "OTP_VERIFY_LOCKED" });
      return { ok: false, response: otpRateLimitFail(failResult) };
    }
    void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: "CODE_NOT_FOUND" });
    return { ok: false, response: fail("Код не найден или истёк.", 401, "CODE_NOT_FOUND") };
  }

  // RKN-FIX-01 (mirrors the phone route): resolve new-vs-existing BEFORE the
  // code is consumed, so a consent refusal doesn't burn the user's code.
  //
  // 🔴 FIX-SEC-EMAIL-IDENTITY-01: ищем ТОЛЬКО профиль с подтверждённым
  // адресом. Раньше здесь был `findUnique({ where: { email } })` — любая
  // строка, включая занятую без доказательства владения (кабинетный
  // request-verify пишет адрес до подтверждения), считалась «этот
  // пользователь вернулся». Итог: владелец адреса вводил свой код и получал
  // сессию В ЧУЖОЙ профиль. Неподтверждённая строка теперь для входа
  // невидима — решение принимает `findVerifiedEmailProfile`.
  const existingProfile = await findVerifiedEmailProfile(normalizedEmail);

  if (!existingProfile && !hasRequiredConsents(consent)) {
    void recordSurfaceEvent({
      surface: "auth",
      outcome: "denied",
      operation: "otp-email-verify",
      code: "CONSENT_REQUIRED",
    });
    return { ok: false, response: fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED") };
  }

  await Promise.all([
    clearOtpEmailVerifyFailures(normalizedEmail, clientIp),
    otp ? prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } }) : Promise.resolve(),
  ]);

  // OTP-EMAIL-LOGIN-RACE: create-or-recover is delegated so a P2002 from two
  // simultaneous first-time logins re-reads the winner's row instead of
  // erroring (6th re-read-on-conflict site — see email-login-profile.ts).
  // FIX-SEC-EMAIL-IDENTITY-01: отказ «адрес занят строкой без доказательства
  // владения» — это НОРМАЛЬНОЕ решение, а не сбой. Без этого catch AppError
  // улетал в общий обработчик и превращался в 500: пользователь видел
  // «ошибку сервера», а GlitchTip получал алерт на штатную ветку.
  let profile;
  try {
    profile = await resolveEmailLoginProfile(normalizedEmail, existingProfile);
  } catch (error) {
    const appError = toAuthSurfaceError(error);
    if (appError.code === "EMAIL_NOT_VERIFIED") {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "denied",
        operation: "otp-email-verify",
        code: appError.code,
      });
      return { ok: false, response: fail(appError.message, appError.status, appError.code) };
    }
    throw error;
  }

  const ipAddress = clientIp;
  const userAgent = req.headers.get("user-agent");

  // RKN-FIX-01 — same single writer as every other registration path.
  const consentPromise = consent
    ? recordUserConsents({ userId: profile.id, flags: consent, ipAddress, userAgent })
    : Promise.resolve();

  const redirectDecision = options.resolveRedirect ? await resolveCabinetRedirect(profile.id) : null;
  await consentPromise;

  return {
    ok: true,
    profile: { id: profile.id, phone: profile.phone ?? null, roles: profile.roles },
    redirect: redirectDecision?.target ?? null,
    startedAt,
  };
}

/**
 * Хвост входа ПОСЛЕ выдачи сессии — одинаковый для веба и приложения:
 * бесплатная подписка по ролям (fire-and-forget с алертом), сброс кэша
 * `GET /api/me`, финальный лог.
 */
export function completeOtpLogin(
  profile: OtpLoginProfile,
  channel: OtpLoginChannel,
  startedAt: number,
): void {
  void ensureFreeSubscriptionsForRoles(profile.id, profile.roles).catch((error) => {
    logError(
      channel === "phone"
        ? "ensureFreeSubscriptionsForRoles failed after otp verify"
        : "ensureFreeSubscriptionsForRoles failed after email otp verify",
      {
        userProfileId: profile.id,
        error: error instanceof Error ? error.stack : error,
      },
    );
    void sendTelegramAlert(
      channel === "phone"
        ? "A user logged in without a free subscription"
        : "A user logged in via email without a free subscription",
      channel === "phone" ? "auth:free-subscription:otp" : "auth:free-subscription:email-otp",
    );
  });
  void invalidateMeIdentityCache(profile.id);
  if (channel === "phone") {
    logInfo("OTP verify completed", { userProfileId: profile.id, totalMs: Date.now() - startedAt });
  } else {
    logInfo("Email OTP verify completed", { userProfileId: profile.id });
  }
}
