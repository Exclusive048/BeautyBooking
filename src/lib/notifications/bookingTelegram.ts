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
  if (safeName && safePhone) return `\u041a\u043b\u0438\u0435\u043d\u0442: ${safeName}, ${safePhone}`;
  if (safeName) return `\u041a\u043b\u0438\u0435\u043d\u0442: ${safeName}`;
  if (safePhone) return `\u041a\u043b\u0438\u0435\u043d\u0442: ${safePhone}`;
  return null;
}

function formatMasterLine(name?: string | null): string | null {
  const safeName = name?.trim() ?? "";
  return safeName ? `\u041c\u0430\u0441\u0442\u0435\u0440: ${safeName}` : null;
}

function pushIf(lines: string[], value: string | null | undefined) {
  if (value && value.trim().length > 0) lines.push(value);
}

export function buildBookingCreatedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["\ud83d\udcc5 \u041d\u043e\u0432\u0430\u044f \u0437\u0430\u043f\u0438\u0441\u044c"];
  pushIf(lines, `\u0423\u0441\u043b\u0443\u0433\u0430: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `\u041a\u043e\u0433\u0434\u0430: ${payload.whenText}` : null);
  pushIf(lines, formatClientLine(payload.clientName, payload.clientPhone));
  pushIf(lines, `\u0421\u0441\u044b\u043b\u043a\u0430: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildBookingCancelledText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["\u274c \u0417\u0430\u043f\u0438\u0441\u044c \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u0430"];
  pushIf(lines, `\u0423\u0441\u043b\u0443\u0433\u0430: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `\u041a\u043e\u0433\u0434\u0430: ${payload.whenText}` : null);
  pushIf(lines, `\u0421\u0441\u044b\u043b\u043a\u0430: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildBookingConfirmedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["\u2705 \u0417\u0430\u043f\u0438\u0441\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430"];
  pushIf(lines, `\u0423\u0441\u043b\u0443\u0433\u0430: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `\u041a\u043e\u0433\u0434\u0430: ${payload.whenText}` : null);
  pushIf(lines, formatMasterLine(payload.masterName));
  pushIf(lines, `\u0421\u0441\u044b\u043b\u043a\u0430: ${payload.linkUrl}`);
  return lines.join("\n");
}

export function buildClientBookingCreatedText(payload: BookingTelegramPayload): string {
  const lines: string[] = ["\u2705 \u0417\u0430\u043f\u0438\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u043d\u0430"];
  pushIf(lines, `\u0423\u0441\u043b\u0443\u0433\u0430: ${payload.serviceName}`);
  pushIf(lines, payload.whenText ? `\u041a\u043e\u0433\u0434\u0430: ${payload.whenText}` : null);
  pushIf(lines, `\u0421\u0441\u044b\u043b\u043a\u0430: ${payload.linkUrl}`);
  return lines.join("\n");
}
