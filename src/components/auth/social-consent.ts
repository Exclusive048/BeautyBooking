/**
 * RKN-FIX-01 — what a social-login button needs to know about consent.
 *
 * `granted` decides whether the button may fire at all (the required boxes are
 * ticked); `query` is the `terms=…&pd=…&marketing=…` string handed to the
 * provider's `start` route, which re-validates it server-side and signs it into
 * a state-bound cookie for the callback. Client-safe by construction — the
 * shape is built in the login form from `consentFlagsToQuery`.
 */
export type SocialConsent = {
  granted: boolean;
  query: string;
};

/** Append the captured consent to a provider's start URL. */
export function withConsentQuery(startPath: string, consent?: SocialConsent): string {
  if (!consent?.query) return startPath;
  return `${startPath}?${consent.query}`;
}
