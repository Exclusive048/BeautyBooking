import { cookies } from "next/headers";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { createSessionToken } from "@/lib/auth/jwt";
import { authenticateTelegramLogin } from "@/lib/auth/telegram-login";
import { telegramLoginSchema } from "@/lib/auth/schemas";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = telegramLoginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return fail("Telegram bot token is not configured", 500, "TELEGRAM_BOT_TOKEN_MISSING");
  }

  const result = await authenticateTelegramLogin(parsed.data, botToken);
  if (!result.ok) {
    return fail(result.message, result.status, result.code);
  }

  const token = createSessionToken(
    { sub: result.user.id, phone: result.user.phone ?? null, roles: result.user.roles },
    60 * 60 * 24 * 30
  );

  const cookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  const cookieStore = await cookies();

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const redirectDecision = await resolveCabinetRedirect(result.user.id);
  return ok({ redirect: redirectDecision.target });
}
