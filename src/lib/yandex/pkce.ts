import { createHash, randomBytes } from "crypto";

// FIX-YANDEX-OAUTH — PKCE helpers, bespoke-parallel to src/lib/vk/pkce.ts.
// Identical generic S256 logic; kept as its own copy (VK never extracted a
// shared module). A future AUTH-PROVIDER-ABSTRACTION unifies both copies.

function base64url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64url(hash);
}
