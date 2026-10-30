/**
 * NOTIFICATION-EMAIL-QUEUE (A-06) — временный ли отказ SMTP.
 *
 * Правило:
 *  - есть код ответа сервера (`responseCode`): 4xx — временный (лимит
 *    отправки, «попробуйте позже», 451/452/421), 5xx — постоянный (адреса нет,
 *    ящик закрыт, неверный логин 535). Повтор 5xx ничего не изменит, а письмо
 *    об ошибке пришло бы ещё шесть раз;
 *  - кода ответа нет — смотрим на код ошибки nodemailer / Node: сеть, DNS,
 *    таймаут соединения или сокета — временные;
 *  - всё остальное (сборка письма, `EAUTH` без ответа сервера, неизвестная
 *    ошибка) — постоянное: повторять только то, что может пройти само.
 */

const TRANSIENT_ERROR_CODES = new Set([
  // nodemailer
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ETLS",
  // Node net / dns
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

export type SmtpFailure = {
  transient: boolean;
  code: string | null;
  responseCode: number | null;
  command: string | null;
};

/**
 * Разбирает ошибку nodemailer. Текст ошибки и ответ сервера сюда намеренно не
 * попадают: в них бывает адрес получателя («550 5.1.1 <a@b.ru>: …»), а
 * результат идёт в лог.
 */
export function describeSmtpFailure(error: unknown): SmtpFailure {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : null;
  const responseCode = typeof record.responseCode === "number" ? record.responseCode : null;
  const command = typeof record.command === "string" ? record.command : null;

  const transient =
    responseCode !== null && responseCode >= 400 && responseCode < 600
      ? responseCode < 500
      : code !== null && TRANSIENT_ERROR_CODES.has(code);

  return { transient, code, responseCode, command };
}
