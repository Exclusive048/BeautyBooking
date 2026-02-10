import { createHash, randomBytes } from "crypto";

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
