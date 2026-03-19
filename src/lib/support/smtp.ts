import { domainToASCII } from "node:url";

const NON_ASCII = /[^\x00-\x7F]/;
const EMAIL_REDACTION = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function truncate(value: string, maxLength = 300): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function redactEmails(input: string): string {
  return input.replace(EMAIL_REDACTION, "[redacted-email]");
}

function maskText(value: string): string {
  if (value.length <= 2) return "*".repeat(value.length);
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 2)}***${value.slice(-1)}`;
}

function maskEmailAddress(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return maskText(value);

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const domainParts = domain.split(".").filter(Boolean);
  const topLevel = domainParts.at(-1) ?? "";
  const domainLabel = domainParts[0] ?? domain;
  const maskedLocal = `${local.slice(0, 1)}***`;
  const maskedDomain = `${domainLabel.slice(0, 1)}***`;
  const suffix = topLevel ? `.${topLevel}` : "";
  return `${maskedLocal}@${maskedDomain}${suffix}`;
}

function normalizeEmailDomain(email: string): {
  value: string;
  changed: boolean;
  hadUnicodeDomain: boolean;
} {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return { value: email, changed: false, hadUnicodeDomain: false };
  }

  const localPart = email.slice(0, at);
  const domainPart = email.slice(at + 1);
  const hadUnicodeDomain = NON_ASCII.test(domainPart);
  const asciiDomain = domainToASCII(domainPart);
  if (!asciiDomain) {
    return { value: email, changed: false, hadUnicodeDomain };
  }

  const value = `${localPart}@${asciiDomain}`;
  return { value, changed: value !== email, hadUnicodeDomain };
}

type AddressPart = {
  prefix: string;
  email: string;
  suffix: string;
};

function splitAddressPart(token: string): AddressPart {
  const match = token.match(/^(.*<)\s*([^<>]+)\s*(>.*)$/);
  if (!match) {
    return { prefix: "", email: token, suffix: "" };
  }
  return {
    prefix: match[1],
    email: match[2],
    suffix: match[3],
  };
}

function normalizeAddressToken(token: string): {
  value: string;
  changed: boolean;
  hadUnicodeDomain: boolean;
} {
  const trimmed = token.trim();
  if (!trimmed) return { value: trimmed, changed: false, hadUnicodeDomain: false };

  const { prefix, email, suffix } = splitAddressPart(trimmed);
  const normalized = normalizeEmailDomain(email.trim());
  return {
    value: `${prefix}${normalized.value}${suffix}`,
    changed: normalized.changed,
    hadUnicodeDomain: normalized.hadUnicodeDomain,
  };
}

export function normalizeSmtpAddressList(input: string): {
  value: string;
  changed: boolean;
  hadUnicodeDomain: boolean;
} {
  const tokens = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { value: input, changed: false, hadUnicodeDomain: false };
  }

  let changed = false;
  let hadUnicodeDomain = false;
  const normalized = tokens.map((token) => {
    const result = normalizeAddressToken(token);
    changed ||= result.changed || result.value !== token;
    hadUnicodeDomain ||= result.hadUnicodeDomain;
    return result.value;
  });

  return {
    value: normalized.join(", "),
    changed,
    hadUnicodeDomain,
  };
}

export function maskSmtpIdentity(value: string | null | undefined): string | null {
  if (!value) return null;

  const tokens = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((token) => {
      const { prefix, email, suffix } = splitAddressPart(token);
      const masked = email.includes("@") ? maskEmailAddress(email) : maskText(email);
      return `${prefix}${masked}${suffix}`;
    });

  if (tokens.length === 0) return null;
  return tokens.join(", ");
}

export type SmtpErrorKind =
  | "smtp_auth_error"
  | "smtp_connection_error"
  | "smtp_timeout_error"
  | "smtp_unknown_error";

export type SmtpErrorDetails = {
  errorKind: SmtpErrorKind;
  errorMessage: string;
  errorCode: string | null;
  responseCode: number | null;
  command: string | null;
  response: string | null;
  name: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function inferErrorKind(input: {
  code: string | null;
  responseCode: number | null;
  text: string;
}): SmtpErrorKind {
  const text = input.text.toLowerCase();
  const code = input.code?.toLowerCase() ?? "";

  const isAuth =
    input.responseCode === 535 ||
    code === "eauth" ||
    text.includes("invalid login") ||
    text.includes("authentication failed") ||
    text.includes("auth failed") ||
    text.includes("535 5.7.8") ||
    text.includes("username and password not accepted");
  if (isAuth) return "smtp_auth_error";

  const isTimeout =
    code === "etimedout" ||
    code === "esockettimedout" ||
    text.includes("timeout") ||
    text.includes("timed out");
  if (isTimeout) return "smtp_timeout_error";

  const isConnection =
    [
      "edns",
      "enotfound",
      "eai_again",
      "econnection",
      "esocket",
      "econnreset",
      "econnrefused",
      "ehostunreach",
      "enetunreach",
      "etls",
    ].includes(code) ||
    text.includes("dns") ||
    text.includes("getaddrinfo") ||
    text.includes("connection") ||
    text.includes("connect") ||
    text.includes("socket") ||
    text.includes("tls") ||
    text.includes("ssl") ||
    text.includes("certificate");
  if (isConnection) return "smtp_connection_error";

  return "smtp_unknown_error";
}

export function extractSmtpErrorDetails(error: unknown): SmtpErrorDetails {
  const record = toRecord(error);
  const rawMessage =
    asString(record?.message) ??
    (error instanceof Error ? error.message : null) ??
    String(error);

  const errorCodeValue = record?.code;
  const errorCode =
    typeof errorCodeValue === "number"
      ? String(errorCodeValue)
      : asString(errorCodeValue);

  const responseCode = asNumber(record?.responseCode);
  const command = asString(record?.command);
  const response = asString(record?.response);
  const name = asString(record?.name) ?? (error instanceof Error ? error.name : null);

  const mergedText = [rawMessage, errorCode ?? "", response ?? "", command ?? ""].join(" ");
  const errorKind = inferErrorKind({ code: errorCode, responseCode, text: mergedText });

  return {
    errorKind,
    errorMessage: truncate(redactEmails(rawMessage)),
    errorCode,
    responseCode,
    command,
    response: response ? truncate(redactEmails(response)) : null,
    name,
  };
}

