import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { verifyTelegramLogin } from "@/lib/auth/telegram";

/**
 * AUTH-PROVIDER-ABSTRACTION-00 — CHARACTERIZATION (pins CURRENT behavior).
 *
 * `verifyTelegramLogin` is the Telegram auth PRIMITIVE: it authenticates the
 * widget payload by recomputing Telegram's `data-check-string` HMAC
 * (secretKey = SHA256(botToken); hmac = HMAC-SHA256(secretKey, dataCheckString))
 * and constant-time-comparing it to the payload's `hash`. This is a pure
 * function (no DB), and it is the security anchor a later provider-abstraction
 * MUST preserve byte-for-byte. These tests describe today's behavior; they must
 * stay green, unchanged, across any refactor.
 */

const BOT_TOKEN = "123456:test-bot-token";

/** Re-implements Telegram's data-check-string HMAC to mint a VALID hash for a
 * given payload — a genuine round-trip against the production verifier. */
function signTelegramPayload(
  payload: Record<string, string | number | undefined>,
  botToken: string,
): string {
  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  return crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function makePayload(): Record<string, string | number | undefined> {
  return {
    id: 42,
    first_name: "Елена",
    last_name: "Петрова",
    username: "elena",
    photo_url: "https://t.me/i/elena.jpg",
    auth_date: 1_700_000_000,
  };
}

describe("verifyTelegramLogin — Telegram HMAC (characterization)", () => {
  it("accepts a correctly-signed payload (round-trip)", () => {
    const payload = makePayload();
    payload.hash = signTelegramPayload(payload, BOT_TOKEN);
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(true);
  });

  it("rejects a tampered field (id changed after signing)", () => {
    const payload = makePayload();
    payload.hash = signTelegramPayload(payload, BOT_TOKEN);
    payload.id = 43; // tamper after hashing
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(false);
  });

  it("rejects a payload signed with a different bot token", () => {
    const payload = makePayload();
    payload.hash = signTelegramPayload(payload, "999999:other-token");
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(false);
  });

  it("rejects a missing hash", () => {
    const payload = makePayload();
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(false);
  });

  it("rejects a garbage hash of the wrong length (length guard before timingSafeEqual)", () => {
    const payload = makePayload();
    payload.hash = "deadbeef";
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(false);
  });

  it("ignores `undefined` fields when building the data-check-string (optional fields absent == absent)", () => {
    // A payload without the optional last_name/photo_url must still verify when
    // signed the same way — the verifier drops `undefined` entries.
    const payload: Record<string, string | number | undefined> = {
      id: 7,
      first_name: "Анна",
      last_name: undefined,
      photo_url: undefined,
      auth_date: 1_700_000_000,
    };
    payload.hash = signTelegramPayload(payload, BOT_TOKEN);
    expect(verifyTelegramLogin(payload, BOT_TOKEN)).toBe(true);
  });
});
