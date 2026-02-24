import crypto from "crypto";

export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[()\s-]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(phone: string, code: string): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is not set");
  }
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}
