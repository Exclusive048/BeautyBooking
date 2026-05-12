import crypto from "crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extractSmtpErrorDetails,
  maskSmtpIdentity,
  normalizeSmtpAddressList,
} from "@/lib/support/smtp";

export const runtime = "nodejs";

const INVALID_FORM_ERROR = "Некорректные данные формы.";
const TOO_MANY_REQUESTS_ERROR =
  "Слишком часто. Попробуйте через несколько минут.";
const SEND_ERROR = "Ошибка отправки. Попробуйте позже.";

/**
 * Partnership inquiries from /partners.
 *
 * Separate from /api/support/tickets because the business logic differs:
 *   - JSON body (no attachments) vs FormData
 *   - Anonymous submission expected (no auth-aware contact resolution)
 *   - Different schema fields (organizationName, kind, telegram, website)
 *   - Different recipient (SUPPORT_TO_PARTNERSHIP with fallback to SUPPORT_TO)
 *
 * Reuses SMTP helpers and rate-limit infrastructure from the support stack.
 */

const PARTNERSHIP_KINDS = [
  "school",
  "brand",
  "media",
  "community",
  "tech",
  "other",
] as const;
type PartnershipKind = (typeof PARTNERSHIP_KINDS)[number];

const KIND_LABELS: Record<PartnershipKind, string> = {
  school: "Школа курсов мастеров",
  brand: "Бренд косметики",
  media: "Медиа / блогер",
  community: "Бьюти-сообщество",
  tech: "Технологический партнёр",
  other: "Другое",
};

const partnershipSchema = z.object({
  kind: z.enum(PARTNERSHIP_KINDS),
  organizationName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telegram: z.string().trim().max(80).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().min(30).max(2000),
  consent: z.literal(true),
  // Honeypot: any non-empty value indicates a bot. Optional + checked separately.
  honeypot: z.string().optional(),
});

const RATE_LIMIT = 3;
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

function buildEmailText(input: {
  kind: PartnershipKind;
  organizationName: string;
  contactName: string;
  email: string;
  telegram: string | null;
  website: string | null;
  description: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): string {
  const lines = [
    "Новая заявка на сотрудничество",
    "",
    `Тип сотрудничества: ${KIND_LABELS[input.kind]}`,
    `Организация: ${input.organizationName}`,
    `Контактное лицо: ${input.contactName}`,
    `Email: ${input.email}`,
    `Telegram: ${input.telegram ?? "—"}`,
    `Сайт / соцсети: ${input.website ?? "—"}`,
    "",
    "Описание:",
    input.description,
    "",
    "—",
    `IP: ${input.ip ?? "—"}`,
    `User-Agent: ${input.userAgent ?? "—"}`,
    `Время: ${input.createdAt.toISOString()}`,
  ];
  return lines.join("\n");
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const route = "POST /api/support/partnership";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: INVALID_FORM_ERROR }, { status: 400 });
  }

  const parsed = partnershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: INVALID_FORM_ERROR }, { status: 400 });
  }

  const data = parsed.data;

  // Honeypot — bot likely filled this hidden field. Pretend success silently
  // so the bot doesn't learn the trap exists, but don't actually send email.
  if (data.honeypot && data.honeypot.trim().length > 0) {
    logInfo("Partnership submission rejected by honeypot", {
      requestId,
      route,
      honeypotLength: data.honeypot.length,
    });
    return NextResponse.json({ ok: true });
  }

  const ip = getFirstIp(req);
  const userAgent = req.headers.get("user-agent") ?? null;

  const ipKey = `partnership:ip:${hashKey(ip ?? "unknown")}`;
  const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!ipAllowed) {
    return NextResponse.json({ ok: false, error: TOO_MANY_REQUESTS_ERROR }, { status: 429 });
  }

  const recipientRaw = (env.SUPPORT_TO_PARTNERSHIP ?? env.SUPPORT_TO)?.trim();
  const smtpHost = env.SMTP_HOST?.trim();
  const smtpPort = env.SMTP_PORT;
  const smtpUserRaw = env.SMTP_USER?.trim();
  const smtpPass = env.SMTP_PASS?.trim();
  const smtpFromRaw = env.SMTP_FROM?.trim();

  const missingEnv = [
    !recipientRaw ? "SUPPORT_TO(_PARTNERSHIP)" : null,
    !smtpHost ? "SMTP_HOST" : null,
    smtpPort === undefined ? "SMTP_PORT" : null,
    !smtpUserRaw ? "SMTP_USER" : null,
    !smtpPass ? "SMTP_PASS" : null,
    !smtpFromRaw ? "SMTP_FROM" : null,
  ].filter(Boolean);

  if (
    missingEnv.length > 0 ||
    !recipientRaw ||
    !smtpHost ||
    smtpPort === undefined ||
    !smtpUserRaw ||
    !smtpPass ||
    !smtpFromRaw
  ) {
    logError("Partnership SMTP env missing", {
      requestId,
      route,
      errorKind: "smtp_env_missing",
      missingEnv,
      smtpHost: smtpHost ?? null,
      smtpPort: smtpPort ?? null,
      smtpUser: maskSmtpIdentity(smtpUserRaw),
      smtpFrom: maskSmtpIdentity(smtpFromRaw),
      recipient: maskSmtpIdentity(recipientRaw),
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  if (smtpPort > 65535) {
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  const normalizedSmtpUser = normalizeSmtpAddressList(smtpUserRaw);
  const normalizedSmtpFrom = normalizeSmtpAddressList(smtpFromRaw);
  const normalizedRecipient = normalizeSmtpAddressList(recipientRaw);

  const secure = smtpPort === 465;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: {
      user: normalizedSmtpUser.value,
      pass: smtpPass,
    },
  });

  const createdAt = new Date();
  const telegram = data.telegram?.trim() || null;
  const website = data.website?.trim() || null;

  const safeOrgName = data.organizationName.replace(/\s+/g, " ").trim().slice(0, 80);
  const subject = `[Сотрудничество] ${safeOrgName} — ${KIND_LABELS[data.kind]}`;

  const text = buildEmailText({
    kind: data.kind,
    organizationName: data.organizationName,
    contactName: data.contactName,
    email: data.email,
    telegram,
    website,
    description: data.description,
    ip,
    userAgent,
    createdAt,
  });

  const smtpDiagnostics = {
    smtpHost,
    smtpPort,
    smtpUser: maskSmtpIdentity(normalizedSmtpUser.value),
    smtpFrom: maskSmtpIdentity(normalizedSmtpFrom.value),
    recipient: maskSmtpIdentity(normalizedRecipient.value),
    secure,
  };

  try {
    await transporter.verify();
  } catch (error) {
    const smtpError = extractSmtpErrorDetails(error);
    logError("Partnership SMTP verify failed", {
      requestId,
      route,
      phase: "verify",
      errorKind: smtpError.errorKind,
      errorMessage: smtpError.errorMessage,
      ...smtpDiagnostics,
      kind: data.kind,
      ip,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  try {
    await transporter.sendMail({
      from: normalizedSmtpFrom.value,
      to: normalizedRecipient.value,
      replyTo: data.email,
      subject,
      text,
    });
  } catch (error) {
    const smtpError = extractSmtpErrorDetails(error);
    logError("Partnership email send failed", {
      requestId,
      route,
      phase: "send",
      errorKind: smtpError.errorKind,
      errorMessage: smtpError.errorMessage,
      ...smtpDiagnostics,
      kind: data.kind,
      ip,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  logInfo("Partnership inquiry submitted", {
    requestId,
    route,
    kind: data.kind,
    organizationLength: data.organizationName.length,
    descriptionLength: data.description.length,
    hasTelegram: Boolean(telegram),
    hasWebsite: Boolean(website),
    ip,
  });

  return NextResponse.json({ ok: true });
}
