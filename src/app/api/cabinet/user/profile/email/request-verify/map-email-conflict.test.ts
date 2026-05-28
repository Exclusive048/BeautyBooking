import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { mapEmailAlreadyUsedConflict } from "./route";

/**
 * EMAIL-VERIFY-FIX-A — closes 🔴 #1 pre-launch blocker
 * (P2002 → 500 on email-change to an already-used address).
 *
 * Locks the atomic catch behaviour of `mapEmailAlreadyUsedConflict`:
 *   - Prisma P2002 (unique-violation on `UserProfile.email`) →
 *     AppError(409, "EMAIL_ALREADY_USED") with a user-friendly
 *     Russian message.
 *   - Any other error → null (route handler re-throws so
 *     `toAppError` upstream handles it).
 *
 * Mirrors `mapPrismaBookingConflict` test discipline — pure helper,
 * deterministic, no Prisma client needed (we construct
 * `PrismaClientKnownRequestError` directly).
 */

function makeP2002() {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`email`)",
    { code: "P2002", clientVersion: "test", meta: { target: ["email"] } },
  );
}

describe("mapEmailAlreadyUsedConflict", () => {
  it("maps Prisma P2002 to AppError 409 EMAIL_ALREADY_USED", () => {
    const result = mapEmailAlreadyUsedConflict(makeP2002());
    expect(result).toBeInstanceOf(AppError);
    expect(result?.status).toBe(409);
    expect(result?.code).toBe("EMAIL_ALREADY_USED");
    expect(result?.message).toContain("уже используется");
  });

  it("returns null for non-P2002 Prisma errors (re-thrown by caller)", () => {
    const otherPrismaError = new Prisma.PrismaClientKnownRequestError(
      "Record to update not found",
      { code: "P2025", clientVersion: "test" },
    );
    expect(mapEmailAlreadyUsedConflict(otherPrismaError)).toBeNull();
  });

  it("returns null for plain JS errors (re-thrown by caller)", () => {
    expect(mapEmailAlreadyUsedConflict(new Error("something else"))).toBeNull();
  });

  it("returns null for non-Error values (re-thrown by caller)", () => {
    expect(mapEmailAlreadyUsedConflict("oops")).toBeNull();
    expect(mapEmailAlreadyUsedConflict(null)).toBeNull();
    expect(mapEmailAlreadyUsedConflict(undefined)).toBeNull();
  });
});
