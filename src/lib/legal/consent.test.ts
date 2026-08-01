import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConsentType } from "@prisma/client";

/**
 * RKN-FIX-01 — `recordUserConsents` is the single writer of consent proof, so
 * these pin the four behaviours the compliance story rests on:
 *   • rows carry the REAL document version (not a `"1.0"` literal);
 *   • one row per ticked purpose, none for an unticked one;
 *   • repeat logins write nothing (no row spam);
 *   • a version bump writes a NEW row and leaves the old proof intact.
 */

const prismaMock = vi.hoisted(() => ({
  userConsent: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { recordUserConsents, consentDocumentVersion } from "@/lib/legal/consent";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const ALL = { terms: true, pdProcessing: true, marketing: true };
const REQUIRED_ONLY = { terms: true, pdProcessing: true, marketing: false };

function createdRows() {
  return prismaMock.userConsent.createMany.mock.calls[0]?.[0]?.data ?? [];
}

describe("recordUserConsents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userConsent.findMany.mockResolvedValue([]);
    prismaMock.userConsent.createMany.mockResolvedValue({ count: 0 });
    prismaMock.userConsent.updateMany.mockResolvedValue({ count: 0 });
  });

  it("stamps each row with the version of ITS document, from the source of truth", async () => {
    await recordUserConsents({ userId: "u1", flags: ALL, ipAddress: "1.2.3.4", userAgent: "UA" });

    expect(createdRows()).toEqual([
      {
        userId: "u1",
        consentType: ConsentType.TERMS,
        documentVersion: LEGAL_DOCUMENTS.TERMS.version,
        ipAddress: "1.2.3.4",
        userAgent: "UA",
      },
      {
        userId: "u1",
        consentType: ConsentType.PD_PROCESSING,
        documentVersion: LEGAL_DOCUMENTS.PD_CONSENT.version,
        ipAddress: "1.2.3.4",
        userAgent: "UA",
      },
      {
        userId: "u1",
        consentType: ConsentType.MARKETING,
        documentVersion: LEGAL_DOCUMENTS.MARKETING.version,
        ipAddress: "1.2.3.4",
        userAgent: "UA",
      },
    ]);
  });

  it("records PD processing as PD_PROCESSING and never as PRIVACY", async () => {
    await recordUserConsents({ userId: "u1", flags: REQUIRED_ONLY });
    const types = createdRows().map((row: { consentType: ConsentType }) => row.consentType);
    expect(types).toContain(ConsentType.PD_PROCESSING);
    expect(types).not.toContain(ConsentType.PRIVACY);
  });

  it("writes no marketing row when the optional box is unticked", async () => {
    await recordUserConsents({ userId: "u1", flags: REQUIRED_ONLY });
    const types = createdRows().map((row: { consentType: ConsentType }) => row.consentType);
    expect(types).toEqual([ConsentType.TERMS, ConsentType.PD_PROCESSING]);
  });

  it("writes nothing at all when no box is ticked", async () => {
    await recordUserConsents({ userId: "u1", flags: { terms: false, pdProcessing: false, marketing: false } });
    expect(prismaMock.userConsent.findMany).not.toHaveBeenCalled();
    expect(prismaMock.userConsent.createMany).not.toHaveBeenCalled();
  });

  it("repeat login on the SAME versions writes no rows (no spam)", async () => {
    prismaMock.userConsent.findMany.mockResolvedValue([
      { id: "c1", consentType: ConsentType.TERMS, documentVersion: LEGAL_DOCUMENTS.TERMS.version, revokedAt: null },
      {
        id: "c2",
        consentType: ConsentType.PD_PROCESSING,
        documentVersion: LEGAL_DOCUMENTS.PD_CONSENT.version,
        revokedAt: null,
      },
    ]);

    await recordUserConsents({ userId: "u1", flags: REQUIRED_ONLY });

    expect(prismaMock.userConsent.createMany).not.toHaveBeenCalled();
    expect(prismaMock.userConsent.updateMany).not.toHaveBeenCalled();
  });

  it("a document version bump produces a NEW row on the next login", async () => {
    // Only the OLD version is on record — the current version is missing.
    prismaMock.userConsent.findMany.mockResolvedValue([
      { id: "c1", consentType: ConsentType.TERMS, documentVersion: "0.9", revokedAt: null },
    ]);

    await recordUserConsents({ userId: "u1", flags: { terms: true, pdProcessing: false, marketing: false } });

    expect(createdRows()).toEqual([
      expect.objectContaining({
        consentType: ConsentType.TERMS,
        documentVersion: LEGAL_DOCUMENTS.TERMS.version,
      }),
    ]);
    // The old proof is neither updated nor deleted.
    expect(prismaMock.userConsent.updateMany).not.toHaveBeenCalled();
  });

  it("re-consent after a withdrawal revives the revoked row with a fresh timestamp", async () => {
    prismaMock.userConsent.findMany.mockResolvedValue([
      {
        id: "c1",
        consentType: ConsentType.MARKETING,
        documentVersion: LEGAL_DOCUMENTS.MARKETING.version,
        revokedAt: new Date("2026-01-01"),
      },
    ]);

    await recordUserConsents({
      userId: "u1",
      flags: { terms: false, pdProcessing: false, marketing: true },
      ipAddress: "9.9.9.9",
      userAgent: "UA2",
    });

    expect(prismaMock.userConsent.createMany).not.toHaveBeenCalled();
    const [call] = prismaMock.userConsent.updateMany.mock.calls;
    expect(call[0].where).toEqual({ id: { in: ["c1"] } });
    expect(call[0].data).toMatchObject({ revokedAt: null, ipAddress: "9.9.9.9", userAgent: "UA2" });
    expect(call[0].data.agreedAt).toBeInstanceOf(Date);
  });

  it("never throws into the login flow when the write fails", async () => {
    prismaMock.userConsent.findMany.mockRejectedValue(new Error("db down"));
    await expect(recordUserConsents({ userId: "u1", flags: ALL })).resolves.toBeUndefined();
  });
});

describe("consentDocumentVersion", () => {
  it("maps every recordable purpose to its document", () => {
    expect(consentDocumentVersion(ConsentType.TERMS)).toBe(LEGAL_DOCUMENTS.TERMS.version);
    expect(consentDocumentVersion(ConsentType.PD_PROCESSING)).toBe(LEGAL_DOCUMENTS.PD_CONSENT.version);
    expect(consentDocumentVersion(ConsentType.MARKETING)).toBe(LEGAL_DOCUMENTS.MARKETING.version);
  });

  it("refuses to stamp a version on a purpose with no mapped document", () => {
    // PRIVACY is deliberately unmapped: the policy is informational, the
    // consent act is PD_PROCESSING. Recording it would be a silent mistake.
    expect(() => consentDocumentVersion(ConsentType.PRIVACY)).toThrow();
    expect(() => consentDocumentVersion(ConsentType.PUBLIC_PROFILE)).toThrow();
  });
});
