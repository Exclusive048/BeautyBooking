import "server-only";

import { cache } from "react";
import { isPhoneAuthEnabled, isVkAuthEnabled, isYandexAuthEnabled } from "@/lib/env";
import { isEmailConfigured } from "@/lib/email/sender";
import { getTelegramEnabled } from "@/lib/telegram/feature";

/**
 * AUTH-GATE-01 — single source of truth for "which login methods may a visitor
 * see right now".
 *
 * Phone (OTP) is NOT the only auth method in this codebase: `/login` also
 * offers email OTP (SMTP-gated), VK OAuth and Yandex OAuth, plus Telegram when
 * the legal kill-switch allows it. So gating phone auth must not blanket-hide
 * `/login` — that would take working VK/Yandex/email logins offline with it.
 *
 * The rule instead is derived:
 *   • the phone tab and the phone OTP endpoints follow `phone`;
 *   • the login CTAs in the global chrome follow `any` — they disappear only
 *     when NOTHING is left to click through to;
 *   • `/login` renders its graceful "скоро" state on `!any`.
 *
 * With the launch `.env.production.example` (VK/Yandex/Telegram creds empty,
 * SMS creds empty — ENV-SPLIT-01: фичи включаются конфигурацией, флагов нет),
 * `any` collapses to whether SMTP is configured — exactly the intended
 * pre-SMS behaviour.
 *
 * 🔴 Server-only (reads server-only env + a SystemConfig row). Client
 * components receive the resolved object as a prop; they must never import
 * `isPhoneAuthEnabled` / `isVkAuthEnabled` / `isEmailConfigured` directly (see
 * the server-only note on `isPhoneAuthEnabled` in src/lib/env.ts).
 */
export type AuthMethodAvailability = {
  phone: boolean;
  email: boolean;
  vk: boolean;
  yandex: boolean;
  telegram: boolean;
  /** True when at least one method above can actually complete a login. */
  any: boolean;
};

/**
 * Wrapped in React `cache()` so the root layout, the topbar and `/login` share
 * ONE resolution per request instead of each re-reading the Telegram
 * SystemConfig row.
 */
export const resolveAuthMethods = cache(async (): Promise<AuthMethodAvailability> => {
  // `getTelegramEnabled` short-circuits on the env ceiling before touching the
  // DB, so with the launch config (Telegram off) this costs no query at all —
  // and it is cached 30 s otherwise. Cheap enough for the topbar/root layout.
  const telegram = await getTelegramEnabled();

  const phone = isPhoneAuthEnabled;
  const email = isEmailConfigured();
  const vk = isVkAuthEnabled;
  const yandex = isYandexAuthEnabled;

  return {
    phone,
    email,
    vk,
    yandex,
    telegram,
    any: phone || email || vk || yandex || telegram,
  };
});
