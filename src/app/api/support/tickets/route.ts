import crypto from "crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisConnection } from "@/lib/redis/connection";
import { normalizeSupportContact, resolveSupportContactFromUser } from "@/lib/support/contact";
import { extractSmtpErrorDetails, maskSmtpIdentity, normalizeSmtpAddressList } from "@/lib/support/smtp";
import {
  getSupportAttachmentValidationMessage,
  validateSupportAttachmentMeta,
} from "@/lib/support/attachment";

export const runtime = "nodejs";

const INVALID_FORM_ERROR = "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0444\u043e\u0440\u043c\u044b.";
const TOO_MANY_REQUESTS_ERROR =
  "\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u0447\u0430\u0441\u0442\u043e. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043c\u0438\u043d\u0443\u0442.";
const SEND_ERROR = "\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0437\u0436\u0435.";

const supportTicketSchema = z.object({
  type: z.enum(["bug", "suggestion"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(2000),
  contact: z.string().trim().max(200).nullable().optional(),
  pageUrl: z.string().trim().max(500).nullable().optional(),
});

const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10 * 60;

type ContactSource = "client_input" | "email" | "telegram" | "vk" | "sms" | "none";

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

function readFormText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  return value;
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
  contact: string | null;
  fileName: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  ip: string | null;
  userId: string | null;
  createdAt: Date;
}): string {
  const lines = [
    "\u041d\u043e\u0432\u044b\u0439 \u0442\u0438\u043a\u0435\u0442 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438",
    `\u0422\u0438\u043f: ${input.type}`,
    `\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a: ${input.title}`,
    "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435:",
    input.description,
    "",
    `\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u0434\u043b\u044f \u0441\u0432\u044f\u0437\u0438: ${input.contact ?? "\u2014"}`,
    `\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430: ${input.pageUrl ?? "\u2014"}`,
    `\u0424\u0430\u0439\u043b: ${input.fileName ?? "\u2014"}`,
    `User-Agent: ${input.userAgent ?? "\u2014"}`,
    `IP: ${input.ip ?? "\u2014"}`,
    `UserId: ${input.userId ?? "\u2014"}`,
    `\u0412\u0440\u0435\u043c\u044f: ${input.createdAt.toISOString()}`,
  ];

  return lines.join("\n");
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const route = "POST /api/support/tickets";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: INVALID_FORM_ERROR }, { status: 400 });
  }

  const parsed = supportTicketSchema.safeParse({
    type: readFormText(formData, "type") ?? "",
    title: readFormText(formData, "title") ?? "",
    description: readFormText(formData, "description") ?? "",
    contact: readFormText(formData, "contact"),
    pageUrl: readFormText(formData, "pageUrl"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: INVALID_FORM_ERROR }, { status: 400 });
  }

  const data = parsed.data;
  const fileEntry = formData.get("file");
  if (fileEntry !== null && !(fileEntry instanceof File)) {
    return NextResponse.json({ ok: false, error: INVALID_FORM_ERROR }, { status: 400 });
  }

  let attachment:
    | {
        file: File;
        fileName: string;
        mimeType: string;
        size: number;
      }
    | null = null;

  if (fileEntry instanceof File) {
    const validation = validateSupportAttachmentMeta({
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      size: fileEntry.size,
    });
    if (!validation.ok) {
      logInfo("Support ticket attachment rejected", {
        requestId,
        route,
        errorKind: "attachment_validation_failed",
        attachmentValidationCode: validation.code,
        attachmentSize: fileEntry.size,
        attachmentMime: normalizeOptional(fileEntry.type),
        attachmentNameLength: fileEntry.name.length,
      });
      return NextResponse.json(
        { ok: false, error: getSupportAttachmentValidationMessage(validation.code) },
        { status: 400 }
      );
    }

    attachment = {
      file: fileEntry,
      fileName: validation.normalizedFileName,
      mimeType: validation.normalizedMimeType,
      size: validation.size,
    };
  }

  const ip = getFirstIp(req);
  const userAgent = normalizeOptional(req.headers.get("user-agent"));
  const fileName = attachment?.fileName ?? null;
  const pageUrl = normalizeOptional(data.pageUrl);
  const user = await getSessionUser();
  const userId = user?.id ?? null;

  let contact = normalizeSupportContact(data.contact);
  let contactSource: ContactSource = contact ? "client_input" : "none";

  if (!contact) {
    try {
      const resolved = await resolveSupportContactFromUser(
        user
          ? {
              id: user.id,
              email: user.email ?? null,
              phone: user.phone ?? null,
              telegramId: user.telegramId ?? null,
            }
          : null
      );
      contact = normalizeSupportContact(resolved.contact);
      contactSource = resolved.source;
    } catch (error) {
      logError("Support ticket contact fallback resolve failed", {
        requestId,
        route,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const attachmentDiagnostics = {
    hasAttachment: Boolean(attachment),
    attachmentNameLength: attachment?.fileName.length ?? 0,
    attachmentSize: attachment?.size ?? 0,
    attachmentMime: attachment?.mimeType ?? null,
  };

  const redis = await getRedisConnection();
  if (!redis) {
    logInfo("Support rate limit fallback to memory", { requestId, route });
  }

  const ipKey = `support:ip:${hashKey(ip ?? "unknown")}`;
  const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!ipAllowed) {
    return NextResponse.json({ ok: false, error: TOO_MANY_REQUESTS_ERROR }, { status: 429 });
  }

  if (userId) {
    const userKey = `support:user:${hashKey(userId)}`;
    const userAllowed = await checkRateLimit(userKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!userAllowed) {
      return NextResponse.json({ ok: false, error: TOO_MANY_REQUESTS_ERROR }, { status: 429 });
    }
  }

  const supportToRaw = process.env.SUPPORT_TO?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPortRaw = process.env.SMTP_PORT?.trim();
  const smtpUserRaw = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpFromRaw = process.env.SMTP_FROM?.trim();

  const missingEnv = [
    !supportToRaw ? "SUPPORT_TO" : null,
    !smtpHost ? "SMTP_HOST" : null,
    !smtpPortRaw ? "SMTP_PORT" : null,
    !smtpUserRaw ? "SMTP_USER" : null,
    !smtpPass ? "SMTP_PASS" : null,
    !smtpFromRaw ? "SMTP_FROM" : null,
  ].filter(Boolean);

  if (missingEnv.length > 0) {
    logError("Support ticket SMTP env missing", {
      requestId,
      route,
      errorKind: "smtp_env_missing",
      missingEnv,
      smtpHost: smtpHost ?? null,
      smtpPortRaw: smtpPortRaw ?? null,
      smtpUser: maskSmtpIdentity(smtpUserRaw),
      smtpFrom: maskSmtpIdentity(smtpFromRaw),
      supportTo: maskSmtpIdentity(supportToRaw),
      hasPass: Boolean(smtpPass),
      passLength: smtpPass?.length ?? 0,
      ...attachmentDiagnostics,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  if (!supportToRaw || !smtpHost || !smtpPortRaw || !smtpUserRaw || !smtpPass || !smtpFromRaw) {
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  const smtpPort = Number(smtpPortRaw);
  if (!Number.isFinite(smtpPort) || smtpPort <= 0 || smtpPort > 65535 || !Number.isInteger(smtpPort)) {
    logError("Support ticket SMTP port invalid", {
      requestId,
      route,
      errorKind: "smtp_port_invalid",
      smtpPortRaw,
      smtpHost,
      smtpUser: maskSmtpIdentity(smtpUserRaw),
      smtpFrom: maskSmtpIdentity(smtpFromRaw),
      supportTo: maskSmtpIdentity(supportToRaw),
      hasPass: Boolean(smtpPass),
      passLength: smtpPass.length,
      ...attachmentDiagnostics,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  const normalizedSmtpUser = normalizeSmtpAddressList(smtpUserRaw);
  const normalizedSmtpFrom = normalizeSmtpAddressList(smtpFromRaw);
  const normalizedSupportTo = normalizeSmtpAddressList(supportToRaw);

  if (
    normalizedSmtpUser.hadUnicodeDomain ||
    normalizedSmtpFrom.hadUnicodeDomain ||
    normalizedSupportTo.hadUnicodeDomain
  ) {
    logInfo("Support ticket SMTP IDN domain detected", {
      requestId,
      route,
      userHadUnicodeDomain: normalizedSmtpUser.hadUnicodeDomain,
      fromHadUnicodeDomain: normalizedSmtpFrom.hadUnicodeDomain,
      toHadUnicodeDomain: normalizedSupportTo.hadUnicodeDomain,
      userNormalized: normalizedSmtpUser.changed,
      fromNormalized: normalizedSmtpFrom.changed,
      toNormalized: normalizedSupportTo.changed,
    });
  }

  const secure = smtpPort === 465;
  const smtpDiagnostics = {
    smtpHost,
    smtpPort,
    smtpUser: maskSmtpIdentity(normalizedSmtpUser.value),
    smtpFrom: maskSmtpIdentity(normalizedSmtpFrom.value),
    supportTo: maskSmtpIdentity(normalizedSupportTo.value),
    hasPass: Boolean(smtpPass),
    passLength: smtpPass.length,
    secure,
  };

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: {
      user: normalizedSmtpUser.value,
      pass: smtpPass,
    },
  });

  const safeTitle = data.title.replace(/\s+/g, " ").trim().slice(0, 120);
  const createdAt = new Date();
  const text = buildEmailText({
    type: data.type,
    title: data.title,
    description: data.description,
    contact,
    fileName,
    pageUrl,
    userAgent,
    ip,
    userId,
    createdAt,
  });

  try {
    await transporter.verify();
  } catch (error) {
    const smtpError = extractSmtpErrorDetails(error);
    logError("Support ticket SMTP verify failed", {
      requestId,
      route,
      phase: "verify",
      errorKind: smtpError.errorKind,
      errorMessage: smtpError.errorMessage,
      errorCode: smtpError.errorCode,
      responseCode: smtpError.responseCode,
      command: smtpError.command,
      errorName: smtpError.name,
      response: smtpError.response,
      ...smtpDiagnostics,
      type: data.type,
      titleLength: data.title.length,
      descriptionLength: data.description.length,
      ...attachmentDiagnostics,
      pageUrl: safePageForLog(pageUrl),
      userId,
      ip,
      contactPresent: Boolean(contact),
      contactLength: contact?.length ?? 0,
      contactSource,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  try {
    const attachments = attachment
      ? [
          {
            filename: attachment.fileName,
            content: Buffer.from(await attachment.file.arrayBuffer()),
            contentType: attachment.mimeType,
          },
        ]
      : undefined;

    await transporter.sendMail({
      from: normalizedSmtpFrom.value,
      to: normalizedSupportTo.value,
      subject: `Support [${data.type}] ${safeTitle}`,
      text,
      attachments,
    });
  } catch (error) {
    const smtpError = extractSmtpErrorDetails(error);
    logError("Support ticket email send failed", {
      requestId,
      route,
      phase: "send",
      errorKind: smtpError.errorKind,
      errorMessage: smtpError.errorMessage,
      errorCode: smtpError.errorCode,
      responseCode: smtpError.responseCode,
      command: smtpError.command,
      errorName: smtpError.name,
      response: smtpError.response,
      ...smtpDiagnostics,
      type: data.type,
      titleLength: data.title.length,
      descriptionLength: data.description.length,
      ...attachmentDiagnostics,
      pageUrl: safePageForLog(pageUrl),
      userId,
      ip,
      contactPresent: Boolean(contact),
      contactLength: contact?.length ?? 0,
      contactSource,
    });
    return NextResponse.json({ ok: false, error: SEND_ERROR }, { status: 500 });
  }

  logInfo("Support ticket submitted", {
    requestId,
    route,
    type: data.type,
    titleLength: data.title.length,
    descriptionLength: data.description.length,
    ...attachmentDiagnostics,
    pageUrl: safePageForLog(pageUrl),
    userId,
    ip,
    contactPresent: Boolean(contact),
    contactLength: contact?.length ?? 0,
    contactSource,
  });

  return NextResponse.json({ ok: true });
}
