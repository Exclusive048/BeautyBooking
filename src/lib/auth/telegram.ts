import crypto from "crypto";

type TelegramPayloadValue = string | number | undefined;

export function verifyTelegramLogin(
  payload: Record<string, TelegramPayloadValue>,
  botToken: string
): boolean {
  const hashValue = payload.hash;
  if (!hashValue) return false;

  const hash = String(hashValue);
  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (hmac.length !== hash.length) return false;

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
}
