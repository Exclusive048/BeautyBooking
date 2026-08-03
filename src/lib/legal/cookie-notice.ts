import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

/**
 * RKN-FIX-06 — the ONE place that owns the cookie-notice mechanics.
 *
 * ## Why this is a NOTICE and not a consent
 *
 * The filed item asked to "store the cookie decision server-side". The audit
 * (Phase 0 census, in the report) enumerated every cookie this product sets and
 * found them ALL technically necessary — session, refresh, OAuth state/PKCE/
 * consent carriers, the city the visitor picked, a "seen the intro" flag, and
 * this notice itself. There is no analytics, no advertising, no third-party
 * tag anywhere in the repo.
 *
 * With nothing to gate, an accept/decline banner is a choice over nothing:
 * clicking «Отклонить» changed no behaviour, because there was no behaviour to
 * change. Recording that click as a consent act would manufacture a consent
 * record for a non-act — the same fault RKN-FIX-02 refused to commit when it
 * declined to write `UserConsent` rows on behalf of established accounts. So
 * NOTHING is written to `UserConsent` here, by design; the cookie below records
 * only "this visitor has been shown the notice", which is an informational
 * fact, not a legal act.
 *
 * ## What changes the day analytics arrives
 *
 * `CookieCategory` is the landing point. Today it has exactly one member,
 * `necessary`, which is always granted. Adding `analytics` here is what turns
 * the notice into a real category choice: the serialisation already carries a
 * letter set, `parseCookieNoticeValue` already rejects unknown letters (so an
 * old cookie can never silently read as "analytics granted"), and the loader of
 * the new script gates on the parsed grants. At that point the banner gains a
 * real decline and the decision becomes a consent act worth recording. The
 * BACKLOG trigger («Первый аналитический/сторонний скрипт») points here.
 *
 * Client-safe on purpose (инв. #15): zero prisma/redis/node/`next/headers`
 * imports, so the banner component and the server layout can both use it. The
 * server side passes the raw cookie value in — this module never reaches for a
 * request context of its own.
 */

/** First-party. `mr_` prefix mirrors `mr-city-slug`; underscore keeps it a valid cookie name. */
export const COOKIE_NOTICE_COOKIE = "mr_cookie_notice";

/** One year — long enough that a returning visitor is not re-notified every week. */
export const COOKIE_NOTICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * The pre-RKN-FIX-06 storage: `localStorage["cookie-consent"] = "accepted" | "rejected"`.
 * Read once for migration, then removed. See `consumeLegacyAcknowledgement`.
 */
export const LEGACY_COOKIE_NOTICE_STORAGE_KEY = "cookie-consent";

/** The notice wording the acknowledgement is against — bump re-shows the banner. */
export const COOKIE_NOTICE_VERSION = LEGAL_DOCUMENTS.COOKIE_NOTICE.version;

/**
 * Cookie categories this product uses.
 *
 * `necessary` is the only member and is always true: it covers cookies without
 * which the requested service cannot work (auth, CSRF/PKCE, the visitor's own
 * city choice, this notice). It is not offerable — refusing it would mean
 * refusing to log in.
 */
export const COOKIE_CATEGORIES = ["necessary"] as const;
export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];
export type CookieCategoryGrants = Readonly<Record<CookieCategory, boolean>>;

/** The only grant shape that exists today. */
export const NECESSARY_ONLY_GRANTS: CookieCategoryGrants = { necessary: true };

/**
 * Letter-per-category serialisation, same idiom as `consent-flags.ts`: only
 * granted categories appear, and an unknown letter is rejected outright rather
 * than ignored — so a value written by a future (or tampered) version can never
 * be read as granting something this build does not understand.
 */
const CATEGORY_LETTERS: ReadonlyArray<{ letter: string; category: CookieCategory }> = [
  { letter: "n", category: "necessary" },
];

export type CookieNoticeAcknowledgement = {
  /** Which notice wording was shown. */
  version: string;
  grants: CookieCategoryGrants;
};

export function serializeCookieNoticeValue(
  version: string = COOKIE_NOTICE_VERSION,
  grants: CookieCategoryGrants = NECESSARY_ONLY_GRANTS,
): string {
  const letters = CATEGORY_LETTERS.filter(({ category }) => grants[category])
    .map(({ letter }) => letter)
    .join("");
  return `${version}:${letters}`;
}

/**
 * Returns null for anything that is not a well-formed acknowledgement — absent,
 * truncated, hand-edited, or carrying a category this build does not know.
 * Callers treat null as "not acknowledged" and show the notice again, which is
 * the fail-safe direction (worst case: a visitor sees an informational banner
 * a second time).
 */
export function parseCookieNoticeValue(
  raw: string | null | undefined,
): CookieNoticeAcknowledgement | null {
  if (!raw) return null;

  const separator = raw.indexOf(":");
  if (separator <= 0) return null;

  const version = raw.slice(0, separator);
  const letters = raw.slice(separator + 1);

  const grants: Record<CookieCategory, boolean> = { necessary: false };
  for (const char of letters) {
    const entry = CATEGORY_LETTERS.find((candidate) => candidate.letter === char);
    if (!entry) return null;
    grants[entry.category] = true;
  }

  // `necessary` is definitionally granted; a value that fails to assert it is
  // malformed, not a visitor who opted out of being able to log in.
  if (!grants.necessary) return null;

  return { version, grants };
}

/**
 * Has this visitor been shown the CURRENT notice? A version bump makes every
 * stored acknowledgement stale, so the banner returns on its own — the same
 * "bump the version in the SoT and re-consent flows by itself" contract that
 * `documents.ts` gives the consent documents.
 */
export function hasAcknowledgedCookieNotice(raw: string | null | undefined): boolean {
  return parseCookieNoticeValue(raw)?.version === COOKIE_NOTICE_VERSION;
}

/**
 * What a given stored value grants. Today it is always necessary-only; the
 * signature exists so the first analytics script has a typed thing to gate on
 * instead of inventing its own storage.
 */
export function cookieCategoryGrants(raw: string | null | undefined): CookieCategoryGrants {
  return parseCookieNoticeValue(raw)?.grants ?? NECESSARY_ONLY_GRANTS;
}

/* ------------------------------------------------------------------------- *
 * Browser side. Guarded so the module stays importable from a server layout.
 * ------------------------------------------------------------------------- */

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** The raw stored value, or null on a server render / cookie-less browser. */
export function readCookieNoticeValue(): string | null {
  return readCookie(COOKIE_NOTICE_COOKIE);
}

/**
 * Persist "notice shown and acknowledged".
 *
 * Not httpOnly on purpose — the banner reads it to stay hidden after an
 * acknowledgement without a round-trip. `SameSite=Lax`, and `Secure` whenever
 * the page is on HTTPS (dev runs on plain http, where a `Secure` cookie would
 * be dropped and the banner would come back on every navigation).
 */
export function writeCookieNoticeAcknowledgement(
  version: string = COOKIE_NOTICE_VERSION,
  grants: CookieCategoryGrants = NECESSARY_ONLY_GRANTS,
): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(serializeCookieNoticeValue(version, grants));
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NOTICE_COOKIE}=${value}; path=/; max-age=${COOKIE_NOTICE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * One-shot migration off `localStorage["cookie-consent"]`.
 *
 * Both legacy values count as acknowledged, including `"rejected"`: that click
 * declined nothing (there was nothing to decline), but the person did see the
 * notice — re-showing it would be a downgrade for them. The key is removed so
 * this runs exactly once per browser.
 *
 * Returns true when a legacy acknowledgement was found and mirrored.
 */
export function consumeLegacyAcknowledgement(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const legacy = window.localStorage.getItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
    if (legacy !== "accepted" && legacy !== "rejected") return false;
    window.localStorage.removeItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
    writeCookieNoticeAcknowledgement();
    return true;
  } catch {
    // localStorage unavailable (private browsing / disabled) — nothing to migrate.
    return false;
  }
}
