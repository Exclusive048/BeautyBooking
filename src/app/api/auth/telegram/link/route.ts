import { NextResponse, type NextRequest } from "next/server";

import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { telegramLoginSchema } from "@/lib/auth/schemas";
import { verifyTelegramLogin } from "@/lib/auth/telegram";
import { getTelegramEnabled } from "@/lib/telegram/feature";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const MAX_AUTH_AGE_SECONDS = 60 * 60;

function isAuthDateFresh(authDate: number, nowSeconds: number): boolean {
  if (authDate > nowSeconds + 60) return false;
  return nowSeconds - authDate <= MAX_AUTH_AGE_SECONDS;
}

/**
 * FIX-B18 · TELEGRAM-LINK-POST-DEAD — здесь был `POST`, и он удалён.
 *
 * Это класс SEC-09: мёртвая поверхность, которая при этом **разбирает вход и
 * пишет в БД**. У неё было ноль вызывающих в продукте (`data-auth-url` в
 * `telegram-connect-modal.tsx` ведёт на `GET` ниже — виджет НАВИГИРУЕТ браузер,
 * а не шлёт JSON), и единственным потребителем оставался тест килсвитча.
 *
 * Проверка контракта перед удалением (условие постановки задачи): OpenAPI-спека
 * документирует `/api/telegram/link` — это **другой роут**
 * (`src/app/api/telegram/link/`, генерация ссылки на бот-DM). Путь
 * `/api/auth/telegram/link` в спеке отсутствует и числится waived в
 * `scripts/openapi-route-allowlist.txt`, то есть мобильный contract-first
 * клиент на него ссылаться не мог. Совпадение имён — единственное, что их
 * связывает; спутать их легко, поэтому это записано здесь, а не в отчёте.
 *
 * Дублирование было полным: обе ноги делали одну и ту же связку (проверка
 * хеша → freshness → anti-hijack → `$transaction`), то есть у второй копии не
 * было даже собственного поведения, которое можно потерять.
 *
 * Сторож возврата — `auth/telegram-link-post-removed.test.ts`.
 */

const CABINET_PROFILE_PATH = "/cabinet/profile";

/**
 * FIX-24 (Item 2b) — redirect-mode Telegram CONNECT callback.
 *
 * The cabinet `telegram-connect-modal` is switched from `data-onauth` (which
 * makes telegram-widget.js compile the callback string via `new Function`/`eval`
 * at widget-init — the same prod CSP `unsafe-eval` FIX-23 removed from /login)
 * to `data-auth-url` pointing here. **Connect ≠ login:** this links Telegram to
 * the ALREADY-authenticated caller (no session rotation) — it must NOT call the
 * login path. The widget navigates the cabinet here with the signed params; we
 * verify the same HMAC hash + freshness, link to the session user, and redirect
 * back to the profile with a `?telegram=<result>` flag the page surfaces.
 */
export async function GET(req: NextRequest) {
  const backToProfile = (result: string) =>
    NextResponse.redirect(new URL(`${CABINET_PROFILE_PATH}?telegram=${result}`, req.url));

  try {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the redirect-mode connect callback too
    // (the leg that actually links) on the effective kill-switch. Reuses the
    // existing "unconfigured" result the profile page already surfaces.
    if (!(await getTelegramEnabled())) {
      return backToProfile("unconfigured");
    }

    const user = await getSessionUser();
    if (!user) {
      // Connect requires an existing session; bounce to login if it's gone.
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const params = new URL(req.url).searchParams;
    const parsed = telegramLoginSchema.safeParse({
      id: params.get("id"),
      first_name: params.get("first_name"),
      last_name: params.get("last_name") ?? undefined,
      username: params.get("username") ?? undefined,
      photo_url: params.get("photo_url") ?? undefined,
      auth_date: params.get("auth_date"),
      hash: params.get("hash"),
    });
    if (!parsed.success) return backToProfile("error");
    const body = parsed.data;

    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return backToProfile("unconfigured");
    if (!verifyTelegramLogin(body, botToken)) return backToProfile("error");
    if (!isAuthDateFresh(body.auth_date, Math.floor(Date.now() / 1000))) {
      return backToProfile("error");
    }

    const telegramId = String(body.id);
    const otherOwner = await prisma.userProfile.findFirst({
      where: { telegramId, id: { not: user.id } },
      select: { id: true },
    });
    if (otherOwner) return backToProfile("conflict");

    const linked = new Date();
    await prisma.$transaction([
      prisma.userProfile.update({
        where: { id: user.id },
        data: { telegramId, telegramUsername: body.username ?? null },
      }),
      prisma.telegramLink.upsert({
        where: { userId: user.id },
        create: { userId: user.id, telegramUserId: telegramId, isEnabled: true, linkedAt: linked },
        update: { telegramUserId: telegramId, isEnabled: true, linkedAt: linked },
      }),
    ]);

    logInfo("Telegram link completed (redirect)", { userId: user.id, telegramId });
    return backToProfile("connected");
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/auth/telegram/link failed", {
        requestId: getRequestId(req),
        route: "GET /api/auth/telegram/link",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return backToProfile("error");
  }
}
