import { AppError } from "@/lib/api/errors";

export function parseISOToUTC(value: string, field = "date"): Date {
  if (!value || !value.trim()) {
    throw new AppError(`Не указано поле ${field}.`, 400, "DATE_INVALID");
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new AppError(`Некорректное значение поля ${field}.`, 400, "DATE_INVALID");
  }
  return new Date(parsed);
}

export function toISO(date: Date): string {
  return date.toISOString();
}

export function ensureStartBeforeEnd(start: Date, end: Date, field = "endAtUtc") {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new AppError("Некорректное время начала.", 400, "DATE_INVALID");
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new AppError("Некорректное время окончания.", 400, "DATE_INVALID");
  }
  if (end <= start) {
    throw new AppError(`Поле ${field} должно быть больше startAtUtc.`, 400, "TIME_RANGE_INVALID");
  }
}

export function ensureStartNotAfterEnd(start: Date, end: Date, field = "endAtUtc") {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new AppError("Некорректное время начала.", 400, "DATE_INVALID");
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new AppError("Некорректное время окончания.", 400, "DATE_INVALID");
  }
  if (end < start) {
    throw new AppError(`Поле ${field} должно быть больше или равно startAtUtc.`, 400, "TIME_RANGE_INVALID");
  }
}

export function roundToStepMinutes(
  date: Date,
  stepMin: number,
  mode: "floor" | "ceil" | "round" = "round"
): Date {
  const ms = date.getTime();
  if (!Number.isFinite(ms) || !Number.isInteger(stepMin) || stepMin <= 0) {
    throw new AppError("Некорректный шаг времени.", 400, "STEP_INVALID");
  }
  const stepMs = stepMin * 60 * 1000;
  const factor = ms / stepMs;
  const rounded =
    mode === "floor" ? Math.floor(factor) : mode === "ceil" ? Math.ceil(factor) : Math.round(factor);
  return new Date(rounded * stepMs);
}
