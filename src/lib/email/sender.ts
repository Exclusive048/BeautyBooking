import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";

type MailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function buildTransporter() {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = env.SMTP_PORT ?? 587;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function getTransporter() {
  if (_transporter !== undefined) return _transporter;
  _transporter = buildTransporter();
  return _transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendEmail(opts: MailOptions): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    logError("SMTP not configured — email not sent", { to: opts.to, subject: opts.subject });
    return false;
  }
  const from = env.SMTP_FROM ?? env.SMTP_USER;
  try {
    await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    logInfo("Email sent", { to: opts.to, subject: opts.subject });
    return true;
  } catch (error) {
    logError("Failed to send email", {
      to: opts.to,
      subject: opts.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
