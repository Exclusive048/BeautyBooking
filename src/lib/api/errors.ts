const ERROR_CODES = [
  "ADDRESS_REQUIRED",
  "AUTH_DATE_EXPIRED",
  "AUTO_CONFIRM_NOT_ALLOWED_FOR_STUDIO",
  "ACTIVE_BOOKINGS",
  "ALREADY_EXISTS",
  "BILLING_PRICE_LAST_ACTIVE",
  "BLOCK_NOT_FOUND",
  "BOOKINGS_LOAD_FAILED",
  "BOOKING_CANCELLED",
  "BOOKING_ANSWER_REQUIRED",
  "BOOKING_ANSWER_INVALID",
  "BOOKING_QUESTION_NOT_FOUND",
  "BOOKING_CONFLICT",
  "BOOKING_NOT_FOUND",
  "BOOKING_TIME_REQUIRED",
  // LOGIC-02: статус брони изменился между чтением и записью
  "BOOKING_STATUS_CHANGED",
  "PACKAGE_NOT_FOUND",
  "PACKAGE_NOT_SOLO",
  "PACKAGE_NOT_STUDIO",
  "PACKAGE_NOT_BOOKABLE",
  "PACKAGE_INCOMPLETE",
  "PACKAGE_PLACEMENT_FAILED",
  "PACKAGE_MISMATCH",
  "PACKAGE_CANCEL_WHOLE",
  "PACKAGE_ALREADY_CANCELLED",
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
  "CONSENT_REQUIRED",
  // RKN-FIX-18: цель обработки, которую нельзя отозвать тумблером (ПДн/оферта)
  // — такое намерение маршрутизируется в удаление аккаунта, а не исполняется.
  "CONSENT_NOT_SELF_REVOCABLE",
  "DATE_INVALID",
  "DAY_INVALID",
  "DURATION_INVALID",
  "DUPLICATE_REQUEST",
  "EDIT_WINDOW_EXPIRED",
  "EMAIL_ALREADY_USED",
  "EMAIL_SEND_FAILED",
  // FIX-SEC-EMAIL-IDENTITY-01: адрес занят строкой без доказательства владения
  // — войти по нему нельзя, но и второй профиль на тот же email создать нельзя.
  "EMAIL_NOT_VERIFIED",
  "FEATURE_GATE",
  "FORBIDDEN",
  "FORBIDDEN_ROLE",
  "INTERNAL_ERROR",
  "INVALID_BODY",
  "INVALID_HASH",
  "INVALID_REQUEST_PAYLOAD",
  "INVALID_SOCIAL_LINK",
  "INVITE_NOT_FOUND",
  "MASTER_ALREADY_ASSIGNED",
  "MASTER_IN_STUDIO",
  "MASTER_NOT_ACTIVE",
  "MASTER_NOT_FOUND",
  "MASTER_NOT_INVITED",
  "MASTER_PROFILE_NOT_FOUND",
  "MASTER_REQUIRED",
  "MASTER_SERVICE_MISMATCH",
  "OUTSIDE_WORK_HOURS",
  "MEDIA_ASSET_NOT_FOUND",
  "MEDIA_ENTITY_ID_REQUIRED",
  "MEDIA_FILE_REQUIRED",
  "MEDIA_FILE_TOO_LARGE",
  "MEDIA_INVALID_ENTITY",
  "MEDIA_INVALID_KIND",
  "MEDIA_INVALID_MIME",
  "MEDIA_PORTFOLIO_LIMIT_REACHED",
  "MEDIA_REPLACE_ASSET_MISMATCH",
  // SEC-17: суммарная байтовая квота аккаунта исчерпана (`media/types.ts`)
  "MEDIA_STORAGE_QUOTA_EXCEEDED",
  "PHOTO_LIMIT_REACHED",
  "LIMIT_REACHED",
  "NAME_REQUIRED",
  "NOT_FOUND",
  "OWNER_CANNOT_LEAVE",
  "PRICE_INVALID",
  "PAYMENT_TIMEOUT",
  "PAYMENT_NOT_REFUNDABLE",
  "PARTIAL_REFUND_NOT_SUPPORTED",
  "PROVIDER_NOT_FOUND",
  "RANGE_INVALID",
  "RATE_LIMITED",
  "REFERENCE_PHOTO_REQUIRED",
  "REFERENCE_PHOTO_NOT_FOUND",
  "REFERENCE_PHOTO_INVALID",
  "REFERENCE_PHOTO_USED",
  // SEC-16: тело запроса перевалило за планку размера (`lib/http/body-limit.ts`)
  "REQUEST_BODY_TOO_LARGE",
  "REVIEW_ALREADY_EXISTS",
  "REVIEW_NOT_ALLOWED",
  "REVIEW_TARGET_NOT_FOUND",
  "SERVICE_DISABLED",
  "SERVICE_HAS_BOOKINGS",
  "SERVICE_INVALID",
  "SERVICE_NOT_BELONGS_TO_PROVIDER",
  "SERVICE_NOT_FOUND",
  "SERVICE_REQUIRED",
  "SERVICE_UNAVAILABLE",
  "SCHEDULE_DAY_OFF_CONFLICT",
  "SLOT_CONFLICT",
  // FIX-TIMEBLOCK-ENFORCEMENT-01 — booking overlaps a studio/master TimeBlock.
  "TIME_BLOCKED",
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
  // FIX-YANDEX-OAUTH — Yandex ID auth provider error codes (parallel to VK's).
  "YANDEX_CLIENT_ID_MISSING",
  "YANDEX_CLIENT_SECRET_MISSING",
  "YANDEX_REDIRECT_URI_MISSING",
  "YANDEX_STATE_INVALID",
  "YANDEX_INVALID_GRANT",
  "YANDEX_OAUTH_FAILED",
  "YANDEX_PROFILE_FAILED",
  "YANDEX_ALREADY_LINKED",
  "APP_PUBLIC_URL_MISSING",
  "TIME_RANGE_INVALID",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  // Admin billing features editor (ADMIN-BILLING-FIX-B)
  "PARENT_NOT_FOUND",
  "INHERITANCE_CYCLE",
  "STRICT_LIMIT",
  // Booking policy enforcement (BOOKING-WIDGET-A)
  "BOOKING_TOO_SOON",
  "BOOKING_TOO_FAR",
  "NEW_CLIENTS_CLOSED",
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
      return new AppError(input.message || "Не удалось выполнить операцию. Попробуйте ещё раз.", maybeStatus, maybeCode, maybeDetails);
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

  return new AppError("Не удалось выполнить операцию. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
}
