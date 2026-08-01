import { z } from "zod";

/**
 * RKN-FIX-01 — the wire contract for "which boxes did the user tick".
 *
 * One shape travels every registration path: the OTP verify bodies, the OAuth
 * `?terms=…&pd=…&marketing=…` hand-off on `/start`, and the signed state-bound
 * cookie that carries it across the OAuth round-trip. Keeping it in ONE
 * client-safe module (Zod only — no prisma/crypto, инв. #15) is what stops the
 * login form and the servers from drifting apart on what a flag means.
 *
 * `terms` and `pdProcessing` are REQUIRED consents (152-ФЗ ст. 9): a new
 * account cannot be created without both. `marketing` is optional by law and
 * must never gate registration.
 */

export const consentFlagsSchema = z.object({
  /** Пользовательское соглашение (оферта) → ConsentType.TERMS */
  terms: z.boolean(),
  /** Согласие на обработку ПДн → ConsentType.PD_PROCESSING */
  pdProcessing: z.boolean(),
  /** Согласие на маркетинговые коммуникации → ConsentType.MARKETING (optional) */
  marketing: z.boolean().default(false),
});

export type ConsentFlags = z.infer<typeof consentFlagsSchema>;

export const EMPTY_CONSENT_FLAGS: ConsentFlags = {
  terms: false,
  pdProcessing: false,
  marketing: false,
};

/**
 * Both legally required boxes ticked.
 *
 * Typed as a predicate so the routes that refuse-and-return on the false branch
 * can go on using a non-null `ConsentFlags` afterwards. (The narrowing is
 * deliberately coarse: a present-but-unticked object also fails, which is
 * exactly how every caller treats it — no consent, no registration.)
 */
export function hasRequiredConsents(
  flags: ConsentFlags | null | undefined,
): flags is ConsentFlags {
  return Boolean(flags?.terms && flags?.pdProcessing);
}

/**
 * Compact, order-stable serialisation for the OAuth cookie payload: `"tpm"`,
 * `"tp"`, … Only the letters of the granted purposes appear, so a truncated or
 * hand-edited value can never silently read as "everything granted" — an
 * unknown letter is rejected outright.
 */
const FLAG_LETTERS: ReadonlyArray<{ letter: string; key: keyof ConsentFlags }> = [
  { letter: "t", key: "terms" },
  { letter: "p", key: "pdProcessing" },
  { letter: "m", key: "marketing" },
];

export function serializeConsentFlags(flags: ConsentFlags): string {
  return FLAG_LETTERS.filter(({ key }) => flags[key])
    .map(({ letter }) => letter)
    .join("");
}

export function parseConsentFlags(serialized: string | null | undefined): ConsentFlags | null {
  if (serialized === null || serialized === undefined) return null;
  const flags = { ...EMPTY_CONSENT_FLAGS };
  for (const char of serialized) {
    const entry = FLAG_LETTERS.find(({ letter }) => letter === char);
    if (!entry) return null;
    flags[entry.key] = true;
  }
  return flags;
}

/**
 * Query params the login page appends to `/api/auth/{vk,yandex}/start` (and to
 * the Telegram login-init fetch). Read back with `consentFlagsFromParams`.
 */
export function consentFlagsToQuery(flags: ConsentFlags): string {
  const params = new URLSearchParams({
    terms: flags.terms ? "1" : "0",
    pd: flags.pdProcessing ? "1" : "0",
    marketing: flags.marketing ? "1" : "0",
  });
  return params.toString();
}

export function consentFlagsFromParams(params: URLSearchParams): ConsentFlags {
  return {
    terms: params.get("terms") === "1",
    pdProcessing: params.get("pd") === "1",
    marketing: params.get("marketing") === "1",
  };
}
