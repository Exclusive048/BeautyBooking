const ERROR_CODES = [
  "ADDRESS_REQUIRED",
  "AUTH_DATE_EXPIRED",
  "AUTO_CONFIRM_NOT_ALLOWED_FOR_STUDIO",
  "ACTIVE_BOOKINGS",
  "ALREADY_EXISTS",
  "BLOCK_NOT_FOUND",
  "BOOKINGS_LOAD_FAILED",
  "BOOKING_CANCELLED",
  "BOOKING_ANSWER_REQUIRED",
  "BOOKING_ANSWER_INVALID",
  "BOOKING_QUESTION_NOT_FOUND",
  "BOOKING_CONFLICT",
  "BOOKING_NOT_FOUND",
  "BOOKING_TIME_REQUIRED",
  "CANCELLATION_DEADLINE_PASSED",
  "CODE_NOT_FOUND",
  "CLIENT_CARD_NOT_FOUND",
  "CLIENT_KEY_INVALID",
  "BREAKS_LIMIT",
  "BREAK_INVALID",
  "BREAK_OVERLAP",
  "BREAK_RANGE",
  "BUFFER_INVALID",
  "CONFLICT",
  "DATE_INVALID",
  "DAY_INVALID",
  "DURATION_INVALID",
  "DUPLICATE_REQUEST",
  "FEATURE_GATE",
  "FORBIDDEN",
  "FORBIDDEN_ROLE",
  "INTERNAL_ERROR",
  "INVALID_BODY",
  "INVALID_HASH",
  "INVITE_NOT_FOUND",
  "MASTER_ALREADY_ASSIGNED",
  "MASTER_IN_STUDIO",
  "MASTER_NOT_FOUND",
  "MASTER_PROFILE_NOT_FOUND",
  "MASTER_REQUIRED",
  "MEDIA_ASSET_NOT_FOUND",
  "MEDIA_ENTITY_ID_REQUIRED",
  "MEDIA_FILE_REQUIRED",
  "MEDIA_FILE_TOO_LARGE",
  "MEDIA_INVALID_ENTITY",
  "MEDIA_INVALID_KIND",
  "MEDIA_INVALID_MIME",
  "MEDIA_PORTFOLIO_LIMIT_REACHED",
  "MEDIA_REPLACE_ASSET_MISMATCH",
  "PHOTO_LIMIT_REACHED",
  "LIMIT_REACHED",
  "NAME_REQUIRED",
  "NOT_FOUND",
  "OWNER_CANNOT_LEAVE",
  "PRICE_INVALID",
  "PAYMENT_TIMEOUT",
  "PROVIDER_NOT_FOUND",
  "RANGE_INVALID",
  "RATE_LIMITED",
  "REFERENCE_PHOTO_REQUIRED",
  "REFERENCE_PHOTO_NOT_FOUND",
  "REFERENCE_PHOTO_INVALID",
  "REFERENCE_PHOTO_USED",
  "REVIEW_ALREADY_EXISTS",
  "REVIEW_NOT_ALLOWED",
  "REVIEW_TARGET_NOT_FOUND",
  "SERVICE_DISABLED",
  "SERVICE_INVALID",
  "SERVICE_NOT_BELONGS_TO_PROVIDER",
  "SERVICE_NOT_FOUND",
  "SERVICE_REQUIRED",
  "SERVICE_UNAVAILABLE",
  "SCHEDULE_DAY_OFF_CONFLICT",
  "SLOT_CONFLICT",
  "START_REQUIRED",
  "STEP_INVALID",
  "STUDIO_NOT_FOUND",
  "STUDIO_SELECTION_REQUIRED",
  "SYSTEM_FEATURE_DISABLED",
  "TELEGRAM_BOT_TOKEN_MISSING",
  "TELEGRAM_BOT_USERNAME_MISSING",
  "TELEGRAM_NOT_LINKED",
  "VK_CLIENT_ID_MISSING",
  "VK_CLIENT_SECRET_MISSING",
  "VK_REDIRECT_URI_MISSING",
  "VK_ID_CLIENT_ID_MISSING",
  "VK_ID_CLIENT_SECRET_MISSING",
  "VK_ID_REDIRECT_URI_MISSING",
  "VK_STATE_INVALID",
  "VK_ID_INVALID_GRANT",
  "VK_ID_EXPIRED_CODE",
  "VK_ID_OAUTH_FAILED",
  "VK_ID_PROFILE_FAILED",
  "VK_ID_TOKEN_REFRESH_FAILED",
  "VK_ALREADY_LINKED",
  "VK_NOT_LINKED",
  "APP_PUBLIC_URL_MISSING",
  "TIME_RANGE_INVALID",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const ERROR_CODE_SET = new Set<string>(ERROR_CODES as readonly string[]);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export function resolveErrorCode(value: unknown, fallback: ErrorCode): ErrorCode {
  return isErrorCode(value) ? value : fallback;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, code: ErrorCode, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toAppError(input: unknown): AppError {
  if (input instanceof AppError) return input;

  if (input instanceof Error && isRecord(input)) {
    const record = input as Record<string, unknown>;
    const maybeCode = record.code;
    const maybeStatus = record.status;
    const maybeDetails = record.details;
    if (isErrorCode(maybeCode) && typeof maybeStatus === "number") {
      return new AppError(input.message || "Internal error", maybeStatus, maybeCode, maybeDetails);
    }
  }

  if (isRecord(input)) {
    const record = input as Record<string, unknown>;
    const maybeMessage = record.message;
    const maybeCode = record.code;
    const maybeStatus = record.status;
    const maybeDetails = record.details;
    if (typeof maybeMessage === "string" && isErrorCode(maybeCode) && typeof maybeStatus === "number") {
      return new AppError(maybeMessage, maybeStatus, maybeCode, maybeDetails);
    }
  }

  return new AppError("Internal error", 500, "INTERNAL_ERROR");
}
