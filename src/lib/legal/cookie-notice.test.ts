import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  COOKIE_NOTICE_COOKIE,
  COOKIE_NOTICE_MAX_AGE_SECONDS,
  COOKIE_NOTICE_VERSION,
  LEGACY_COOKIE_NOTICE_STORAGE_KEY,
  NECESSARY_ONLY_GRANTS,
  consumeLegacyAcknowledgement,
  cookieCategoryGrants,
  hasAcknowledgedCookieNotice,
  parseCookieNoticeValue,
  readCookieNoticeValue,
  serializeCookieNoticeValue,
  writeCookieNoticeAcknowledgement,
} from "@/lib/legal/cookie-notice";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

/**
 * RKN-FIX-06. Runs in the default `node` environment (no jsdom dep in this
 * repo), so `window`/`document`/`location` are stubbed by hand — same approach
 * as `cities/client-city.test.ts`.
 */

type CookieJar = { value: string };

function installBrowserGlobals(jar: CookieJar, protocol = "http:") {
  const storage = new Map<string, string>();

  const fakeDocument = {
    get cookie(): string {
      return jar.value;
    },
    set cookie(next: string) {
      const [pair] = next.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const name = pair.slice(0, eq);
      const existing = jar.value
        .split(/;\s*/)
        .filter((part) => part && !part.startsWith(`${name}=`));
      jar.value = [...existing, pair].filter(Boolean).join("; ");
    },
  };

  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  };

  Object.assign(globalThis, {
    window: fakeWindow,
    document: fakeDocument,
    location: { protocol },
  });

  return { storage, lastWrite: () => jar.value };
}

function uninstallBrowserGlobals() {
  for (const key of ["window", "document", "location"]) {
    delete (globalThis as Record<string, unknown>)[key];
  }
}

describe("cookie-notice — value format", () => {
  it("round-trips version + necessary grant", () => {
    const raw = serializeCookieNoticeValue();
    expect(raw).toBe(`${COOKIE_NOTICE_VERSION}:n`);

    const parsed = parseCookieNoticeValue(raw);
    expect(parsed).toEqual({
      version: COOKIE_NOTICE_VERSION,
      grants: { necessary: true },
    });
  });

  it("rejects an unknown category letter instead of ignoring it", () => {
    // The day `analytics` exists ("na"), an older build must NOT read that value
    // as an acknowledgement it understands — it re-shows the notice instead.
    expect(parseCookieNoticeValue(`${COOKIE_NOTICE_VERSION}:na`)).toBeNull();
    expect(hasAcknowledgedCookieNotice(`${COOKIE_NOTICE_VERSION}:na`)).toBe(false);
  });

  it("rejects malformed, empty and necessary-less values", () => {
    for (const raw of [null, undefined, "", "1.0", ":n", "1.0:", "garbage"]) {
      expect(parseCookieNoticeValue(raw)).toBeNull();
      expect(hasAcknowledgedCookieNotice(raw)).toBe(false);
    }
  });

  it("treats a stale version as not acknowledged (bump re-shows the banner)", () => {
    expect(hasAcknowledgedCookieNotice(serializeCookieNoticeValue("0.9"))).toBe(false);
    expect(hasAcknowledgedCookieNotice(serializeCookieNoticeValue())).toBe(true);
  });

  it("anchors its version on its OWN documents entry, not on PRIVACY", () => {
    expect(COOKIE_NOTICE_VERSION).toBe(LEGAL_DOCUMENTS.COOKIE_NOTICE.version);
    // Decoupled on purpose: rewording the banner must not stamp a new
    // privacy-policy version, and vice versa. Equal values today are a
    // coincidence of both starting at 1.0 — the identity above is the contract.
    expect(LEGAL_DOCUMENTS.COOKIE_NOTICE.href).toContain("#privacy-cookies");
  });

  it("reports necessary-only grants, including for unreadable values", () => {
    expect(cookieCategoryGrants(serializeCookieNoticeValue())).toEqual(NECESSARY_ONLY_GRANTS);
    expect(cookieCategoryGrants("garbage")).toEqual(NECESSARY_ONLY_GRANTS);
  });
});

describe("cookie-notice — browser storage", () => {
  let jar: CookieJar;

  beforeEach(() => {
    jar = { value: "" };
  });

  afterEach(() => {
    uninstallBrowserGlobals();
  });

  it("writes a readable, 1-year, Lax, path=/ cookie", () => {
    installBrowserGlobals(jar);
    writeCookieNoticeAcknowledgement();

    expect(jar.value).toContain(`${COOKIE_NOTICE_COOKIE}=`);
    expect(readCookieNoticeValue()).toBe(serializeCookieNoticeValue());
    expect(hasAcknowledgedCookieNotice(readCookieNoticeValue())).toBe(true);
  });

  it("omits Secure on http and sets it on https", () => {
    // Captures the RAW attribute string, unlike `installBrowserGlobals`, whose
    // document parses the write down to a name=value pair.
    const writes: string[] = [];
    const capture = (protocol: string) => {
      Object.assign(globalThis, {
        document: {
          get cookie() {
            return "";
          },
          set cookie(next: string) {
            writes.push(next);
          },
        },
        location: { protocol },
      });
      writeCookieNoticeAcknowledgement();
    };

    capture("http:");
    capture("https:");

    const [httpWrite, httpsWrite] = writes;
    expect(httpWrite).not.toContain("Secure");
    expect(httpWrite).toContain("SameSite=Lax");
    expect(httpWrite).toContain("path=/");
    expect(httpWrite).toContain(`max-age=${COOKIE_NOTICE_MAX_AGE_SECONDS}`);
    expect(httpsWrite).toContain("; Secure");
  });

  it("is a no-op on the server (no document)", () => {
    expect(() => writeCookieNoticeAcknowledgement()).not.toThrow();
    expect(readCookieNoticeValue()).toBeNull();
    expect(consumeLegacyAcknowledgement()).toBe(false);
  });
});

describe("cookie-notice — SSR suppression is wired in the root layout", () => {
  // Source-level guard, same technique as инв. #25's `client-privacy.test.ts`:
  // the behaviour under test lives in an async Server Component with the whole
  // app's dependency graph behind it, so what a unit test can durably pin is
  // that the layout still READS the cookie and still GATES the render on it.
  // The rendered-HTML proof is the live smoke in the report.
  const layoutSource = readFileSync(resolve("src/app/layout.tsx"), "utf8");

  it("reads the notice cookie server-side", () => {
    expect(layoutSource).toContain("COOKIE_NOTICE_COOKIE");
    expect(layoutSource).toContain("hasAcknowledgedCookieNotice");
    expect(layoutSource).toMatch(/await cookies\(\)/);
  });

  it("renders <CookieNotice /> only when not acknowledged", () => {
    expect(layoutSource).toMatch(/cookieNoticeAcknowledged\s*\?\s*null\s*:\s*<CookieNotice\s*\/>/);
  });

  it("no longer ships the localStorage-only banner", () => {
    expect(layoutSource).not.toContain("CookieConsent");
  });
});

describe("cookie-notice — localStorage migration", () => {
  let jar: CookieJar;

  beforeEach(() => {
    jar = { value: "" };
  });

  afterEach(() => {
    uninstallBrowserGlobals();
  });

  it("honours a legacy 'accepted' once, then never again", () => {
    const { storage } = installBrowserGlobals(jar);
    storage.set(LEGACY_COOKIE_NOTICE_STORAGE_KEY, "accepted");

    expect(consumeLegacyAcknowledgement()).toBe(true);
    expect(hasAcknowledgedCookieNotice(readCookieNoticeValue())).toBe(true);
    // Key consumed → a second call finds nothing to migrate.
    expect(storage.get(LEGACY_COOKIE_NOTICE_STORAGE_KEY)).toBeUndefined();
    expect(consumeLegacyAcknowledgement()).toBe(false);
  });

  it("honours a legacy 'rejected' too — it declined nothing, but the notice was seen", () => {
    const { storage } = installBrowserGlobals(jar);
    storage.set(LEGACY_COOKIE_NOTICE_STORAGE_KEY, "rejected");

    expect(consumeLegacyAcknowledgement()).toBe(true);
    expect(hasAcknowledgedCookieNotice(readCookieNoticeValue())).toBe(true);
  });

  it("ignores an absent or unrecognised legacy value", () => {
    const { storage } = installBrowserGlobals(jar);
    expect(consumeLegacyAcknowledgement()).toBe(false);

    storage.set(LEGACY_COOKIE_NOTICE_STORAGE_KEY, "maybe");
    expect(consumeLegacyAcknowledgement()).toBe(false);
    expect(jar.value).toBe("");
  });
});
