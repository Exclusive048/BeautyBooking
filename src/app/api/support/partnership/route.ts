import crypto from "crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonFail } from "@/lib/api/contracts";
import type { ErrorCode } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { readBodyTextCapped } from "@/lib/http/body-limit";
import { extractClientIp } from "@/lib/http/ip";
import { SMTP_TIMEOUTS } from "@/lib/email/sender";
import {
  extractSmtpErrorDetails,
  maskSmtpIdentity,
  normalizeSmtpAddressList,
} from "@/lib/support/smtp";

export const runtime = "nodejs";

/**
 * FIX-B18 · SUPPORT-ENVELOPE-SHAPE — обе support-поверхности переведены на
 * конверт проекта.
 *
 * Была собственная форма `{ ok:false, error: <строка> }` — `error` строкой, а
 * не объектом, — и собрана она была руками, то есть мимо `jsonFail()` и мимо
 * `check:error-message-lang`. Тексты здесь всегда были русскими (константы в
 * шапке файла), поэтому находки в них не было; ратифицировать форму мешало
 * другое: пока в проекте живут ДВЕ формы ответа об ошибке, гейт языка
 * обязан иметь слепую зону, а клиент — знать, какая из форм придёт.
 *
 * Конверт добавляет `requestId`, которого у этих ответов не было вовсе, —
 * то есть жалоба «форма не отправилась» становится сопоставимой с логом.
 */
function supportFail(status: number, message: string, code: ErrorCode) {
  return jsonFail(status, message, code);
}

const INVALID_FORM_ERROR = "Проверьте заполненные поля.";
const TOO_MANY_REQUESTS_ERROR =
  "Слишком часто. Попробуйте через несколько минут.";
const TOO_LARGE_ERROR = "Сообщение слишком длинное. Сократите его.";
const SEND_ERROR = "Не удалось отправить заявку. Попробуйте ещё раз.";

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

  // SEC-16: рейт-лимит стоял ПОСЛЕ разбора тела, то есть 429 выдавался уже
  // после того, как произвольно большой JSON прочитан и разобран — ограничитель
  // не ограничивал самую дорогую часть запроса. Порядок теперь: заявленный
  // размер (даром, по заголовку) → лимит → фактические байты → разбор.
  const ip = extractClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? null;

  const ipKey = `partnership:ip:${hashKey(ip ?? "unknown")}`;
  const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!ipAllowed) {
    return supportFail(429, TOO_MANY_REQUESTS_ERROR, "RATE_LIMITED");
  }

  const read = await readBodyTextCapped(req);
  if (!read.ok) {
    return supportFail(413, TOO_LARGE_ERROR, "REQUEST_BODY_TOO_LARGE");
  }

  let body: unknown;
  try {
    body = JSON.parse(read.text) as unknown;
  } catch {
    return supportFail(400, INVALID_FORM_ERROR, "VALIDATION_ERROR");
  }

  const parsed = partnershipSchema.safeParse(body);
  if (!parsed.success) {
    return supportFail(400, INVALID_FORM_ERROR, "VALIDATION_ERROR");
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
    return supportFail(500, SEND_ERROR, "INTERNAL_ERROR");
  }

  if (smtpPort > 65535) {
    return supportFail(500, SEND_ERROR, "INTERNAL_ERROR");
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
    // RES-05: границы — общие с `lib/email/sender.ts`, второго набора значений
    // быть не должно (дефолты nodemailer держат сокет 10 минут).
    ...SMTP_TIMEOUTS,
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

  // RES-05: `transporter.verify()` отсюда убран. Это был ПОЛНЫЙ второй
  // SMTP-сеанс (connect + TLS + AUTH) перед каждой отправкой, то есть удвоение
  // ожидания на пути, который пользователь ждёт синхронно. Диагностика не
  // теряется: отказ соединения/аутентификации всплывает из `sendMail` через
  // тот же `extractSmtpErrorDetails` и тот же набор полей — отличается только
  // `phase`.

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
    return supportFail(500, SEND_ERROR, "INTERNAL_ERROR");
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
