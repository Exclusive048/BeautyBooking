import nodemailer from "nodemailer";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { maskEmail } from "@/lib/logging/masking";

type MailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Дополнительные заголовки письма (например, `List-Unsubscribe` у уведомлений). */
  headers?: Record<string, string>;
};

/**
 * Имя, которым транспорт представляется SMTP-серверу (EHLO). Без него
 * nodemailer берёт `os.hostname()`, а в контейнере это случайный id вида
 * `3f9c2a7b1e04` — он попадает в заголовок `Received` каждого письма, и часть
 * спам-фильтров читает безымянный узел как признак сомнительного источника.
 * Берём хост публичного адреса приложения; без него — дефолт nodemailer.
 */
export function resolveSmtpClientName(): string | undefined {
  const appUrl = resolvePublicAppUrl();
  if (!appUrl) return undefined;
  try {
    return new URL(appUrl).hostname || undefined;
  } catch {
    return undefined;
  }
}

/**
 * RES-05 — верхние границы SMTP-сессии. ЕДИНСТВЕННЫЙ источник для всех
 * транспортов проекта (этот + оба support-роута, которые строят свой).
 *
 * Дефолты nodemailer здесь не «щедрые», а несовместимые с интерактивным
 * запросом: connect 2 мин, greeting 30 с, **socket 10 мин**. Отправка стоит
 * в горячем пути входа — `await sendEmail` держит ответ, а UI переключает шаг
 * на OTP-код только по нему. Поскольку в проде phone-OTP выключен tri-state'ом
 * (`PHONE_AUTH_ENABLED`), email — единственный рабочий канал входа: зависший
 * SMTP означает не «письмо позже», а «войти нельзя», причём с крутящейся
 * кнопкой на десять минут.
 *
 * Значения: 5 с на соединение и приветствие (SMTP-хост в той же сети или
 * рядом — секунды это уже аномалия), 10 с на сокет — письмо с вложением
 * поддержки легитимно дольше рукопожатия.
 */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 5_000,
  greetingTimeout: 5_000,
  socketTimeout: 10_000,
} as const;

function buildTransporter() {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = env.SMTP_PORT ?? 587;
  const name = resolveSmtpClientName();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    ...(name ? { name } : {}),
    ...SMTP_TIMEOUTS,
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
    logError("SMTP not configured — email not sent", { to: maskEmail(opts.to), subject: opts.subject });
    return false;
  }
  const from = env.SMTP_FROM ?? env.SMTP_USER;
  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers: opts.headers,
    });
    logInfo("Email sent", { to: maskEmail(opts.to), subject: opts.subject });
    return true;
  } catch (error) {
    logError("Failed to send email", {
      to: maskEmail(opts.to),
      subject: opts.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
