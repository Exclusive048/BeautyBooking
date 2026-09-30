import { prisma } from "@/lib/prisma";

/**
 * Сколько код входа живёт в таблице после истечения. Код действует 5 минут;
 * сутки запаса — чтобы разбор «не пришёл код» по свежему случаю ещё видел строку.
 */
export const OTP_RETENTION_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Удаляет просроченные коды входа (телефон и почта).
 *
 * До этого строки `OtpCode` не удалялись никогда: по телефону их чистило только
 * удаление аккаунта, по почте — ничто. В строке лишь HMAC кода, но и телефон
 * или адрес, на который код уходил, — персональные данные без цели хранения.
 * Зовёт воркер при старте и раз в сутки.
 */
export async function purgeExpiredOtpCodes(now: Date = new Date()): Promise<{ deleted: number }> {
  const { count } = await prisma.otpCode.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - OTP_RETENTION_AFTER_EXPIRY_MS) } },
  });
  return { deleted: count };
}
