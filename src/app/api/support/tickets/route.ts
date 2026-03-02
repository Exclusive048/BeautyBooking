import crypto from "crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
import { getRedisConnection } from "@/lib/redis/connection";

export const runtime = "nodejs";

const supportTicketSchema = z.object({
  type: z.enum(["bug", "suggestion"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(2000),
  fileName: z.string().trim().max(200).nullable().optional(),
  pageUrl: z.string().trim().max(500).nullable().optional(),
});

const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10 * 60;

function getFirstIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeOptional(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safePageForLog(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  try {
    const url = new URL(pageUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return pageUrl;
  }
}

function buildEmailText(input: {
  type: "bug" | "suggestion";
  title: string;
  description: string;
  fileName: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  ip: string | null;
  userId: string | null;
  createdAt: Date;
}): string {
  const lines = [
    "Новый тикет поддержки",
    `Тип: ${input.type}`,
    `Заголовок: ${input.title}`,
    "Описание:",
    input.description,
    "",
    `Страница: ${input.pageUrl ?? "—"}`,
    `Файл: ${input.fileName ?? "—"}`,
    `User-Agent: ${input.userAgent ?? "—"}`,
    `IP: ${input.ip ?? "—"}`,
    `UserId: ${input.userId ?? "—"}`,
    `Время: ${input.createdAt.toISOString()}`,
  ];

  return lines.join("\n");
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const route = "POST /api/support/tickets";

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные формы." },
      { status: 400 }
    );
  }

  const parsed = supportTicketSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные формы." },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const ip = getFirstIp(req);
  const userAgent = normalizeOptional(req.headers.get("user-agent"));
  const fileName = normalizeOptional(data.fileName);
  const pageUrl = normalizeOptional(data.pageUrl);
  const user = await getSessionUser();
  const userId = user?.id ?? null;

  const redis = await getRedisConnection();
  if (!redis) {
    logInfo("Support rate limit fallback to memory", { requestId, route });
  }

  const ipKey = `support:ip:${hashKey(ip ?? "unknown")}`;
  const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!ipAllowed) {
    return NextResponse.json(
      { ok: false, error: "Слишком часто. Попробуйте через несколько минут." },
      { status: 429 }
    );
  }

  if (userId) {
    const userKey = `support:user:${hashKey(userId)}`;
    const userAllowed = await checkRateLimit(userKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!userAllowed) {
      return NextResponse.json(
        { ok: false, error: "Слишком часто. Попробуйте через несколько минут." },
        { status: 429 }
      );
    }
  }

  const supportTo = process.env.SUPPORT_TO?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPortRaw = process.env.SMTP_PORT?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpFrom = process.env.SMTP_FROM?.trim();

  const missingEnv = [
    !supportTo ? "SUPPORT_TO" : null,
    !smtpHost ? "SMTP_HOST" : null,
    !smtpPortRaw ? "SMTP_PORT" : null,
    !smtpUser ? "SMTP_USER" : null,
    !smtpPass ? "SMTP_PASS" : null,
    !smtpFrom ? "SMTP_FROM" : null,
  ].filter(Boolean);

  if (missingEnv.length > 0) {
    logError("Support ticket SMTP env missing", {
      requestId,
      route,
      missingEnv,
    });
    return NextResponse.json(
      { ok: false, error: "Ошибка отправки. Попробуйте позже." },
      { status: 500 }
    );
  }

  const smtpPort = Number(smtpPortRaw);
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    logError("Support ticket SMTP port invalid", {
      requestId,
      route,
      smtpPortRaw,
    });
    return NextResponse.json(
      { ok: false, error: "Ошибка отправки. Попробуйте позже." },
      { status: 500 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const safeTitle = data.title.replace(/\s+/g, " ").trim().slice(0, 120);
  const createdAt = new Date();
  const text = buildEmailText({
    type: data.type,
    title: data.title,
    description: data.description,
    fileName,
    pageUrl,
    userAgent,
    ip,
    userId,
    createdAt,
  });

  try {
    await transporter.sendMail({
      from: smtpFrom,
      to: supportTo,
      subject: `Support [${data.type}] ${safeTitle}`,
      text,
    });
  } catch (error) {
    logError("Support ticket email send failed", {
      requestId,
      route,
      type: data.type,
      titleLength: data.title.length,
      descriptionLength: data.description.length,
      fileName,
      pageUrl: safePageForLog(pageUrl),
      userId,
      ip,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Ошибка отправки. Попробуйте позже." },
      { status: 500 }
    );
  }

  logInfo("Support ticket submitted", {
    requestId,
    route,
    type: data.type,
    titleLength: data.title.length,
    descriptionLength: data.description.length,
    fileName,
    pageUrl: safePageForLog(pageUrl),
    userId,
    ip,
  });

  return NextResponse.json({ ok: true });
}
