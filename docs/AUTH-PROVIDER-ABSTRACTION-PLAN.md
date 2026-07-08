# AUTH-PROVIDER-ABSTRACTION — Phase 0: Audit, Safety Net & Phased Plan

> **Status:** Phase 0 complete (audit + characterization tests + this plan). **No refactor performed.**
> **Owner decision pending:** whether/when to start implementation phases.
> Spawned by AUTH-DISCOVERY. Backlog rule: *«Не рефакторить под fine-pressure — отложено на после launch.»*

## 0. Timing recommendation (read first)

Auth is the product's highest-risk surface — a regression = users can't log in, or log into the **wrong** account. **Recommend running the implementation phases (§5) only AFTER a live staging round-trip has verified VK + Yandex + Telegram + OTP end-to-end** (a deploy-ops item: real provider apps + creds + redirect URIs). Phase 0 (this doc + the characterization tests) is safe now — it adds a regression net and a plan without touching behavior. If the owner wants to start earlier, that's their call; the hard invariant (§7) still governs every phase.

---

## 1. Per-provider flow map (Phase A audit)

Four mechanisms, two shapes: **OAuth redirect+code** (VK, Yandex), **widget+HMAC** (Telegram), **out-of-band code challenge** (phone/email OTP).

### 1a. VK — TWO flows sharing `src/lib/vk/*`
- **LOGIN** `GET /api/auth/vk/{start,callback}` + `POST /api/auth/vk/unlink`. Public entry (button = plain `<a href="/api/auth/vk/start">`).
- **INTEGRATION / notifications** `GET /api/integrations/vk/{start,callback,status}` + `PATCH .../settings` + `POST .../disable`. **Auth-gated** (`requireAuth`); links VK for notifications, **never issues a session**.
- Sequence (login): `/start` mints `state`=32 rand hex + PKCE verifier/challenge (S256), sets two **HMAC-signed** cookies `vk_id_state`/`vk_id_verifier` (`httpOnly, sameSite=lax, secure=isProduction, path=/, 600s`), 302→`id.vk.ru/authorize` (`scope="email phone"`). `/callback` parses (accepts VK `payload` JSON blob OR flat query + a `device_id`/`type`), reads+verifies+**clears** both cookies (single-use), validates state, exchanges code→token (`id.vk.ru/oauth2/auth`, PKCE **+ client_secret + state + device_id** in body), fetches profile (`id.vk.ru/oauth2/user_info`), then the 3-way branch (§2), issues session.
- Link model `VkLink` (`userId @unique`, `vkUserId @unique`, `accessToken`, `refreshToken`, **`deviceId`**, `isEnabled`, `onDelete: Cascade`).
- Cred resolution `config.ts`: alias-first `VK_ID_*` then canonical `VK_*`, via Zod `env`.

### 1b. Yandex — `src/app/api/auth/yandex/*` + `src/lib/yandex/*`
- `GET /start,/callback` + `POST /unlink`. Bespoke-parallel to VK; the account-linking branch is **line-for-line identical** to VK's except: no `device_id`; plain `?code&state` callback (no payload blob); token POST is PKCE+secret (no device_id/state); profile via `GET login.yandex.ru/info?format=json` with **`Authorization: OAuth <token>`** (not Bearer); no `scope` param (set at app level); avatar built from `default_avatar_id` → hardcoded CDN URL; email via `default_email`/`emails[]` fallback.
- Signed cookies `yandex_oauth_state`/`yandex_oauth_verifier` — **byte-identical** signing to VK (`AUTH_JWT_SECRET` HMAC-SHA256).
- Link model `YandexLink` (same shape as `VkLink` minus `deviceId`).

### 1c. Telegram — `src/app/api/auth/telegram/*` + `src/lib/auth/telegram*` + `src/lib/telegram/feature.ts`
- `GET /login-init` (mints `tg_login_state` signed cookie + nonce), `GET /login` (sole live callback; legacy POST removed HARDENING-09), `POST|GET /link`, `POST /unlink`.
- **Not OAuth**: the browser gets already-signed identity fields from `telegram-widget.js`; auth = local `HMAC-SHA256(SHA256(botToken), dataCheckString)` equality (`verifyTelegramLogin`, pure). No code→token exchange, no PKCE, no client secret, no userinfo fetch. Profile arrives inline in the signed payload.
- CSRF (HARDENING-06): Telegram can't echo a custom `state`, so a nonce rides via `data-auth-url=/api/auth/telegram/login?s=<nonce>`; `/login` clears the single-use `tg_login_state` cookie **before** validating, timing-safe-compares cookie⇔nonce, verifies the Telegram HMAC + `auth_date` freshness (≤1h, +60s skew), and claims a **single-use hash** (`cache.setNx`, 2h TTL, **fail-open** — cookie is primary defense).
- New-vs-existing lives in `authenticateTelegramLogin` (**extracted, testable**); the login path binds identity via `UserProfile.telegramId @unique` and **does not** write a `TelegramLink` row (only `/link` does). `TelegramLink`: `userId @unique`, `telegramUserId` (**not unique**), `chatId @unique`, `isEnabled`.

### 1d. OTP — `src/app/api/auth/otp/{request,verify}` (phone) + `.../otp/email/{request,verify}` (email)
- Code-challenge: `generateOtpCode` (6-digit), `hashOtpCode` = HMAC-SHA256(`{id}:{code}`, `OTP_HMAC_SECRET`) stored on `OtpCode` (plaintext never persisted), 5-min expiry, single-use (`usedAt`), Redis rate-limit (per-IP 5/60s, per-id 3/5min; verify-lock 5 fails→15min; **fail-closed** on Redis outage).
- **No link model, no external identity**: `phone`/`email` are direct `@unique` fields on `UserProfile`. Email verify resolves via `resolveEmailLoginProfile` (P2002 re-read — the 6th site). Phone verify creates inline.
- Session issuance identical to all others.

### 1e. Shared core (identical across ALL four)
`setSessionCookies(response, { sub, phone, roles })` (creates `RefreshSession` + signs access/refresh JWTs + sets cookies) · `resolveCabinetRedirect` · `ensureFreeSubscriptionsForRoles` · `ensureClientRoleForUser`. Session payload shape `{ sub, phone, roles }` is provider-agnostic.

### 1f. Login grid — `src/app/login/login-client.tsx`
OTP (phone/email) is the **primary** form (2-tab switcher when `emailEnabled`). Social providers are a **hardcoded JSX grid** (order Telegram→VK→Yandex) with adaptive `sm:grid-cols-{2,3}` computed from the three enabled flags. Flags resolved server-side in `login/page.tsx` and passed as props (avoids env-alias hydration mismatch). VK/Yandex buttons always mount + self-gate (`return null` when disabled); Telegram is parent-gated (`telegramEnabled &&`).

---

## 2. What's genuinely common vs provider-specific

**Common (the abstraction's safe core):**
- 3-way account branch: `session present → LINK to session user` / `no session + existing link → AUTHENTICATE` / `no session + no link → CREATE [CLIENT] user`.
- Two 409 guards: **primary** (`upsertXLink`: target external-id already bound to a *different* userId → `409 X_ALREADY_LINKED`) + **orphan** (link row resolves to no profile → same 409).
- Backfill-only-empty-fields on existing user + `ensureClientRoleForUser`.
- HMAC-signed `state`+`verifier` cookies (VK ≡ Yandex, byte-identical), single-use clear, S256 PKCE.
- Shared session issuance + redirect + free-subs.

**Provider-specific (MUST keep bespoke — do not flatten):**
- **VK:** `id.vk.ru` endpoints; mandatory `device_id` (threaded through token/refresh + stored on link); PKCE **and** client_secret **and** state echoed in token body; two-flow split (login vs integration) via redirect-URI path rewrite; callback accepts a `payload` JSON blob; dual cred naming (`VK_*`/`VK_ID_*`).
- **Yandex:** `Authorization: OAuth` header; profile field mapping (`default_email`/`emails[]`, avatar CDN URL, `default_phone`); no `scope` param; no `device_id`.
- **Telegram:** widget+HMAC (no code exchange / no PKCE / no client secret / no userinfo); nonce-via-widget instead of provider-echoed state; single-use hash + `auth_date` freshness; redirect-mode forced by CSP.
- **OTP:** a credential-challenge, not a redirect provider — no external `sub`, no link model, different threat model (expiry+single-use+lockout).

---

## 3. Characterization coverage matrix (Phase B — the safety net)

28 tests across 5 new files, all green against **current** code. `✅ pinned now` = unit-testable today; `⛔ needs extraction` = logic is inline in a route handler and can only be characterized after a behavior-identical Phase-1 extraction; `🔶 needs route-harness/network mock` = testable but deferred.

| Provider | new-user | existing-user | 409 guard | CSRF/state | replay | kill-switch |
|---|---|---|---|---|---|---|
| VK | ⛔ inline callback | ⛔ inline callback | ⛔ inline `upsertVkLink` | ✅ `vk/cookies.test.ts` (sign/tamper/malformed) + authorize-URL `vk/oauth.test.ts` | ✅ single-use cookie clear (via cookie tests) | 🔶 predicate only (`isVkAuthEnabled`, env-load timing) |
| Yandex | ⛔ inline callback | ⛔ inline callback | ⛔ inline `upsertYandexLink` | ✅ `yandex/cookies.test.ts` + existing `yandex/oauth.test.ts` (authorize/PKCE/schema) | ✅ single-use cookie clear | 🔶 predicate only |
| Telegram | ✅ `telegram-login.test.ts` (create) | ✅ `telegram-login.test.ts` (backfill+role) | ⛔ inline in `/link` route | ✅ existing `telegram-login-state.test.ts` (state cookie) + `telegram.test.ts` (HMAC) | ✅ `telegram-login-state.test.ts` (`claimTelegramAuthHash`) + freshness in `telegram-login.test.ts` | 🔶 `feature.test.ts` (resolver direction) |
| OTP (email) | ✅ `email-login-profile.test.ts` | ✅ same | ✅ P2002 re-read (same file) | n/a (code challenge) | ✅ single-use `usedAt` (⛔ route-level untested) | 🔶 `isEmailConfigured` |
| OTP (phone) | ⛔ inline verify route (**+ unguarded P2002 — see §8**) | ⛔ inline | n/a | n/a | ⛔ route-level | n/a (always on) |

**New files added this phase:** `src/lib/vk/cookies.test.ts`, `src/lib/vk/oauth.test.ts`, `src/lib/yandex/cookies.test.ts`, `src/lib/auth/telegram.test.ts`, `src/lib/auth/telegram-login.test.ts`.

**The gap that shapes the plan:** the highest-risk logic (OAuth account-linking + both 409 guards + new-vs-existing) is **inline inside the callback route handlers** (`upsertVkLink`/`upsertYandexLink` are route-local, not exported). It cannot be unit-characterized without either a route-handler harness or a behavior-identical extraction. **Therefore Phase 1 is that extraction** — it is the enabler for characterizing the branch, and must itself be pure/behavior-identical.

---

## 4. Target abstraction shape

The registry is for the **redirect-OAuth providers + login-grid rendering** — NOT a universal "every auth method" interface (that's the trap).

```ts
// Conceptual — an OAuth-redirect provider descriptor.
interface OAuthProvider {
  id: "vk" | "yandex";
  enabled(): boolean;                         // isVkAuthEnabled / isYandexAuthEnabled
  display: { label: string; icon: ...; order: number };
  // initiate: build authorize URL + set signed state/verifier cookies
  initiate(req): { redirectUrl: string; cookies: SignedCookie[] };
  // handleCallback: validate state/verifier, exchange code, fetch profile
  //   → returns a NORMALIZED external identity + raw link fields (escape hatch)
  handleCallback(req): Promise<{ externalId: string; profile: NormalizedProfile; linkExtras: unknown }>;
  linkModel: "VkLink" | "YandexLink";         // for the shared finishOAuthLogin seam
}
```
- **Shared seam** `finishOAuthLogin(provider, externalId, profile, sessionUser?)` — the extracted 3-way branch + 409 guards + session issuance (Phase 1 output). Every OAuth provider funnels here.
- **Escape hatches (mandatory):** `linkExtras` carries VK's `device_id` (Yandex passes nothing); `initiate`/`handleCallback` own their provider-specific token/profile shapes; the `OAuthProvider` interface does **not** assume Bearer, `scope`, single combined cookie, or refresh support.
- **Telegram: partial registration only** — register `enabled()` + `display` + an `authenticate()` that wraps the existing widget/HMAC/nonce/single-use-hash path **verbatim**. It does NOT implement `initiate`/`handleCallback` (no redirect+code). Its CSRF (nonce-via-widget + `tg_login_state`) stays bespoke.
- **OTP: not in the registry** — it's a credential challenge with no external identity. It stays its own module; the login-grid renders it as the primary form, not a registry entry.
- **Login-grid:** replace the hardcoded JSX with a map over `registeredProviders.filter(p => p.enabled()).sort(by order)` → identical rendered output for the current 3 providers (behavior-identical is the test).

---

## 5. Phased rollout (one provider per implementation prompt)

Each phase: **behavior-identical**, characterization tests stay **green unchanged**, its own **full auth-regression run** + **staging round-trip** for the touched provider, independently revertible.

- **Phase 1 — registry scaffold + shared seam + login-grid (NO provider logic moved yet).**
  (a) Introduce the `OAuthProvider` registry type + an empty/2-entry registry. (b) Render the login-grid from the registry (VK/Yandex/Telegram entries produce byte-identical JSX). (c) **Extract** the inline callback 3-way branch + 409 guards into `finishOAuthLogin(...)` — pure move, VK + Yandex both call it, behavior-identical. (d) **Add characterization** for `finishOAuthLogin` (new-user / existing / primary-409 / orphan-409) — now possible because the logic is a testable seam. *This is the enabling phase; it removes the ⛔ gaps in §3.*
- **Phase 2 — migrate Yandex onto the registry.** Simplest OAuth provider (no `device_id`, no two-flow, plain callback). `initiate`/`handleCallback` wrap existing `src/lib/yandex/*`. Characterization + `yandex/oauth.test.ts` + `yandex/cookies.test.ts` stay green.
- **Phase 3 — migrate VK onto the registry.** Carries the escape hatches: `device_id` via `linkExtras`, the login-vs-integration two-flow (integration flow may stay a separate non-registry path — it never issues a session), the `payload`-blob callback parse, dual cred naming. `vk/*` tests stay green.
- **Phase 4 — register Telegram (display + enabled + authenticate only).** Do NOT force it into `initiate`/`handleCallback`. Keep widget/HMAC/nonce/`tg_login_state`/single-use-hash bespoke; the registry only unifies its grid rendering + enabled gating. `telegram*` tests stay green.
- **Phase 5 (optional/decision) — OTP.** Recommend it **stays separate** (not OAuth). If anything, register only its login-grid presence. Document the decision; do not shoehorn.

---

## 6. Keep-bespoke / explicit non-goals

- Telegram widget-HMAC verification + nonce-via-`data-auth-url` + single-use hash + `auth_date` freshness (HARDENING-06) — **never** collapsed into an OAuth code path.
- VK `device_id`, two-flow split, `payload`-blob callback, dual cred naming.
- Yandex `Authorization: OAuth`, profile mapping, no-`scope`.
- PKCE specifics + per-provider signed-cookie names.
- OTP as a whole (different mechanism).
- **No behavior change** to account-linking, CSRF, session issuance, or enabled-flag semantics in ANY phase.

---

## 7. 🔒 Hard invariant (governs every implementation phase)

**Pure refactor, zero behavior change.** Each phase must: keep the characterization tests green **unchanged**; change **no** account-linking semantics, CSRF protection, session issuance, or enabled-flag behavior; be a mechanical move into the registry shape, not a redesign. **If a phase reveals a genuine auth bug → it is a SEPARATE fix with its own prompt + owner sign-off, never bundled into the refactor.** (Mixing a behavior fix into a "pure refactor" is exactly how a silent auth regression hides.)

## 8. 🚩 Real auth defects surfaced by characterization (FLAG — do NOT fix in the abstraction)

Each gets its own BACKLOG line; none fixed here.

1. **🟠 OTP-PHONE-LOGIN-RACE (7th P2002 site).** `otp/verify/route.ts` new-user `userProfile.create({ phone })` has **no** P2002 handling — the exact class just fixed for email (`resolveEmailLoginProfile`). Two simultaneous first-time phone logins → loser throws unhandled P2002 → 500. Fix mirrors `resolveEmailLoginProfile` (re-read-on-conflict). **Highest-priority flag** (real, latent, low-probability, trivial fix).
2. **🟠 AUTH-KILLSWITCH-ROUTE-ENFORCEMENT.** OAuth routes (`vk`/`yandex` `start`/`callback`/`unlink`) don't gate on `isVkAuthEnabled`/`isYandexAuthEnabled` server-side; Telegram `/link`/`/unlink` don't call `getTelegramEnabled()`. They only fail on missing creds. With a flag off but creds present, the route still runs. Relevant to FZ-199 (the legal kill-switch relies on gating). Defense-in-depth gap, not a live exploit.
3. **🟡 VK-SHARED-COOKIE-NAMES.** Login + integration flows share `vk_id_state`/`vk_id_verifier`; a concurrent login-start + integration-start in one browser clobber each other's state/verifier. Namespacing per flow fixes it.
4. **🟡 Minor:** email verify lacks the `isEmailConfigured()` gate that email request has; `EMAIL_AUTH_ENABLED` is dead config (declared, unused — real gate is SMTP presence); `emailVerifiedAt` never set on email-OTP login despite the schema field; VK has two duplicated `upsertVkLink` impls with divergent 409 messages (EN vs RU).

## 9. Rollback story

Phase 1 is additive (registry type + seam + grid-render) — revert = restore the hardcoded grid + inline callbacks (the extraction is behavior-identical, so reverting is safe). Phases 2–4 are per-provider file swaps — revert one provider without touching others. Characterization tests are the acceptance gate at every step: if they don't stay green unchanged, the phase is not a pure refactor and must stop.
