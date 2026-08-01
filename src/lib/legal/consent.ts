import "server-only";

import { ConsentType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal/documents";
import { hasRequiredConsents, type ConsentFlags } from "@/lib/legal/consent-flags";

/**
 * RKN-FIX-01 — the single writer of `UserConsent`.
 *
 * Every registration path (phone OTP, email OTP, VK, Yandex, Telegram) records
 * through here, so the stored proof has the same shape everywhere: which
 * purpose, which document version, when, from which IP/UA.
 *
 * Mapping decision (documented in the report): the PD-processing consent gets
 * its OWN `ConsentType.PD_PROCESSING` rather than reusing `PRIVACY`. Reusing
 * `PRIVACY` would leave the data ambiguous — the privacy policy is an
 * informational disclosure (уведомление), the PD consent is a separate legal
 * act against a separate document, and a lawyer reading the table must be able
 * to tell which one a row proves. `PRIVACY` is consequently no longer written.
 */

const CONSENT_DOCUMENT: Partial<Record<ConsentType, LegalDocumentKey>> = {
  [ConsentType.TERMS]: "TERMS",
  [ConsentType.PD_PROCESSING]: "PD_CONSENT",
  [ConsentType.MARKETING]: "MARKETING",
};

/** Version string stamped on a `UserConsent` row of this type. */
export function consentDocumentVersion(consentType: ConsentType): string {
  const key = CONSENT_DOCUMENT[consentType];
  if (!key) {
    throw new Error(`No legal document is mapped to ConsentType.${consentType}`);
  }
  return LEGAL_DOCUMENTS[key].version;
}

/** Which consent rows a set of ticked boxes maps to. Unticked → no row at all. */
export function consentTypesFromFlags(flags: ConsentFlags): ConsentType[] {
  const types: ConsentType[] = [];
  if (flags.terms) types.push(ConsentType.TERMS);
  if (flags.pdProcessing) types.push(ConsentType.PD_PROCESSING);
  // An unticked marketing box records NOTHING — absence of consent, not a
  // "declined" row. Withdrawing an existing marketing consent is a deliberate
  // act with its own UI (RKN-FIX-18), never a side effect of a login form.
  if (flags.marketing) types.push(ConsentType.MARKETING);
  return types;
}

/**
 * Server-side enforcement of the required consents. UI gating is not enough:
 * the boxes are the user's affirmative act, and the route that CREATES the
 * account is what has to refuse without them.
 */
export function assertRequiredConsents(flags: ConsentFlags | null | undefined): asserts flags is ConsentFlags {
  if (!hasRequiredConsents(flags)) {
    throw new AppError(
      "Consent to the user agreement and to personal-data processing is required",
      400,
      "CONSENT_REQUIRED",
    );
  }
}

type RecordConsentsInput = {
  userId: string;
  flags: ConsentFlags;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Write the consent rows for the ticked boxes — idempotently.
 *
 * Repeat logins do NOT spam rows: uniqueness is `(userId, consentType,
 * documentVersion)`, so an active row for the current version means there is
 * nothing to write. Two things still produce a write:
 *   • a version bump — a NEW row for the new version, leaving the older proof
 *     intact (that history is the point: it shows what each version was agreed
 *     to and when);
 *   • re-consent after a withdrawal — the revoked row of that same version is
 *     revived with a fresh `agreedAt`/IP/UA, because the constraint allows only
 *     one row per version and the newest affirmative act is what counts.
 *
 * Never throws into the caller's flow: a consent write failing must not strand
 * a user mid-login, so it is logged and swallowed (the login-blocking check is
 * `assertRequiredConsents`, which runs BEFORE the account is created).
 */
export async function recordUserConsents(input: RecordConsentsInput): Promise<void> {
  const types = consentTypesFromFlags(input.flags);
  if (types.length === 0) return;

  const wanted = types.map((consentType) => ({
    consentType,
    documentVersion: consentDocumentVersion(consentType),
  }));

  try {
    const existing = await prisma.userConsent.findMany({
      where: { userId: input.userId, OR: wanted },
      select: { id: true, consentType: true, documentVersion: true, revokedAt: true },
    });

    const isPresent = (want: (typeof wanted)[number]) =>
      existing.some(
        (row) => row.consentType === want.consentType && row.documentVersion === want.documentVersion,
      );

    const toCreate = wanted.filter((want) => !isPresent(want));
    if (toCreate.length > 0) {
      await prisma.userConsent.createMany({
        data: toCreate.map((want) => ({
          userId: input.userId,
          consentType: want.consentType,
          documentVersion: want.documentVersion,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        })),
        // Two logins racing on a first-ever consent: the loser skips instead of
        // failing the login on a P2002.
        skipDuplicates: true,
      });
    }

    const toRevive = existing.filter((row) => row.revokedAt !== null).map((row) => row.id);
    if (toRevive.length > 0) {
      await prisma.userConsent.updateMany({
        where: { id: { in: toRevive } },
        data: {
          revokedAt: null,
          agreedAt: new Date(),
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    }
  } catch (error) {
    logError("Failed to record user consents", {
      userId: input.userId,
      error: error instanceof Error ? error.stack : String(error),
    });
  }
}
