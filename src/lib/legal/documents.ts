/**
 * RKN-FIX-01 — the ONE place where legal-document versions live.
 *
 * 152-ФЗ ст. 9 (ред. 156-ФЗ, с 01.09.2025) requires the consent FACT to be
 * provable: who agreed, when, and **to which version of which document**. The
 * version used to be a `"1.0"` literal duplicated in two OTP routes, unrelated
 * to the text a user actually saw — unprovable by construction.
 *
 * The contract now is:
 *   • every consent-recording path reads its `documentVersion` from here;
 *   • every document page renders its version + date from here;
 *   • editing a document = edit its content file + bump `version`/`updatedAt`
 *     in THIS file, and nothing else. The bump then flows into newly recorded
 *     `UserConsent` rows on its own, and (because the row uniqueness is
 *     `userId + consentType + documentVersion`) the next login of an existing
 *     user writes a fresh row for the new version — re-consent-on-update with
 *     no extra machinery.
 *
 * Client-safe on purpose (инв. #15): zero prisma/redis/node imports, so the
 * login form and the document pages can both read it. The
 * `ConsentType` → document mapping lives in the server-only `consent.ts`.
 */

export type LegalDocument = {
  /** Bumped whenever the wording changes in a way that needs re-consent. */
  version: string;
  /** ISO date of that wording — rendered as «версия N от {дата}». */
  updatedAt: string;
  /** Where the document lives, for consent-form links. */
  href: string;
};

export const LEGAL_DOCUMENTS = {
  /** Пользовательское соглашение (оферта) — `/terms`. */
  TERMS: { version: "1.0", updatedAt: "2026-04-28", href: "/terms" },
  /**
   * Политика конфиденциальности — `/privacy`. An informational disclosure, not
   * a consent act: nothing records a `PRIVACY` row (see `consent.ts`). Versioned
   * here anyway so the page has one source for its «последнее обновление».
   */
  PRIVACY: { version: "1.0", updatedAt: "2026-04-28", href: "/privacy" },
  /**
   * Согласие на обработку персональных данных — `/consent`. The separate
   * per-purpose document the law asks for; deliberately NOT the privacy policy.
   */
  PD_CONSENT: { version: "1.0", updatedAt: "2026-08-01", href: "/consent" },
  /**
   * Согласие на маркетинговые коммуникации — an optional, separately versioned
   * purpose. Its wording is section 7 of the PD-consent document, so it links
   * there; the separate version means marketing wording can change without
   * forcing everyone to re-consent to PD processing.
   */
  MARKETING: { version: "1.0", updatedAt: "2026-08-01", href: "/consent#consent-marketing" },
  /**
   * RKN-FIX-06 — the cookie NOTICE (`cookie-notice.ts` + the banner).
   *
   * Its own entry rather than riding `PRIVACY`, deliberately: the two change for
   * different reasons and a shared version would couple them the wrong way.
   * Rewording the banner would otherwise stamp a new privacy-policy version on
   * every consent row recorded afterwards (a version event that never happened),
   * and conversely an unrelated privacy-policy edit would pop the banner back up
   * for every visitor. Separate versions, separate triggers.
   *
   * `href` points into the policy's cookie section — the notice has no page of
   * its own, exactly like MARKETING lives inside the PD-consent document.
   *
   * NOTE: this version is NOT a `ConsentType` and never lands in `UserConsent`
   * (`consent.ts` maps only the three real consent purposes). It versions an
   * informational disclosure — see the rationale header in `cookie-notice.ts`.
   */
  COOKIE_NOTICE: { version: "1.0", updatedAt: "2026-08-03", href: "/privacy#privacy-cookies" },
} as const satisfies Record<string, LegalDocument>;

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;
