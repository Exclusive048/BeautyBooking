type BookingTelegramPayload = {
  serviceName: string;
  whenText: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  masterName?: string | null;
  linkUrl: string;
  referencePhotoUrl?: string | null;
  bookingAnswers?: Array<{ questionText: string; answer: string }>;
};

function formatClientLine(name?: string | null, phone?: string | null): string | null {
  const safeName = name?.trim() ?? "";
  const safePhone = phone?.trim() ?? "";
  if (safeName && safePhone) return `Клиент: ${safeName}, ${safePhone}`;
  if (safeName) return `Клиент: ${safeName}`;
  if (safePhone) return `Клиент: ${safePhone}`;
  return null;
}

function formatMasterLine(name?: string | null): string | null {
  const safeName = name?.trim() ?? "";
  return safeName ? `Мастер: ${safeName}` : null;
}

function pushIf(lines: string[], value: string | null | undefined) {
  if (value && value.trim().length > 0) lines.push(value);
}

function pushBookingAnswers(
  lines: string[],
  answers?: Array<{ questionText: string; answer: string }> | null
) {
  if (!answers || answers.length === 0) return;
  const normalized = answers
    .map((item) => ({
      question: item.questionText?.trim() ?? "",
      answer: item.answer?.trim() ?? "",
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
  if (normalized.length === 0) return;

  lines.push("💬 Ответы клиента:");
  for (const item of normalized) {
    lines.push(`• ${item.question}: ${item.answer}`);
  }
}

export function buildBookingCreatedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["📅 Новая запись"];
  pushIf(lines, `Услуга: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `Когда: ${payload.whenText}` : null);
  pushIf(lines, formatClientLine(payload.clientName, payload.clientPhone));
  pushIf(
    lines,
    payload.referencePhotoUrl ? `📎 Клиент прикрепил референс: ${payload.referencePhotoUrl}` : null
  );
  pushBookingAnswers(lines, payload.bookingAnswers);
  pushIf(lines, `Ссылка: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildBookingCancelledText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["❌ Запись отменена"];
  pushIf(lines, `Услуга: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `Когда: ${payload.whenText}` : null);
  pushIf(lines, `Ссылка: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildBookingConfirmedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["✅ Запись подтверждена"];
  pushIf(lines, `Услуга: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `Когда: ${payload.whenText}` : null);
  pushIf(lines, formatMasterLine(payload.masterName));
  pushIf(lines, `Ссылка: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildClientBookingCreatedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["✅ Запись создана"];
  pushIf(lines, `Услуга: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `Когда: ${payload.whenText}` : null);
  pushIf(lines, `Ссылка: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildBookingReminderText(
  payload: BookingTelegramPayload & { kind: "REMINDER_24H" | "REMINDER_2H" }
): string {
  const suffix =
    payload.kind === "REMINDER_24H"
      ? "за 24 часа"
      : "за 2 часа";
  const lines: string[] = [`⏰ Напоминание ${suffix}`];
  pushIf(lines, `Услуга: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `Когда: ${payload.whenText}` : null);
  pushIf(lines, formatClientLine(payload.clientName, payload.clientPhone));
  pushIf(lines, formatMasterLine(payload.masterName));
  pushIf(lines, `Ссылка: ${payload.linkUrl}`);
  return lines.join("\n");
}
