import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 20 * 60 * 1000;

export type TelegramLinkTokenResult = {
  token: string;
  expiresAt: Date;
};

export function hashTelegramToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateTelegramLinkToken(userId: string): Promise<TelegramLinkTokenResult> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashTelegramToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.telegramLinkToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}
