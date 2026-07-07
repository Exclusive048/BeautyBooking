type BookingTelegramPayload = {
  serviceName: string;
  whenText: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  masterName?: string | null;
  linkUrl: string;
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

// HARDENING-09: the CREATED / CANCELLED / CONFIRMED / client-created builders and
// the `pushBookingAnswers` helper were removed together with the dead lifecycle
// Telegram sender — only the reminder is a live Telegram path.
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
