import { randomUUID } from "crypto";

export type TelegramSendPayload = {
  chatId: string;
  text: string;
};

export type BookingReminderKind = "REMINDER_24H" | "REMINDER_2H";

export type BookingReminderPayload = {
  bookingId: string;
  kind: BookingReminderKind;
  startAtUtc: string;
};

export type VisualSearchIndexPayload = {
  assetId: string;
};

export type SlotFreedPayload = {
  providerId: string;
  providerName: string;
  providerPublicUsername: string | null;
  timezone: string;
  slotStartAtUtc: string;
  slotEndAtUtc: string;
  serviceName: string | null;
  cancelledByUserId: string | null;
};

export type MediaCleanupPayload = Record<string, never>;

export type MrrSnapshotDailyPayload = Record<string, never>;

export type PlanEditedNotifyPayload = {
  planId: string;
  planCode: string;
  /** Pre-rendered Russian summary built by `buildPlanEditedSummary`.
   * Falls back to a generic copy if the original diff was too thin
   * to summarise — the enqueuer should skip dispatch instead. */
  summary: string;
};

export type YookassaWebhookPayload = {
  event?: string;
  type?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown> | null;
    payment_method?: { id?: string; saved?: boolean };
    confirmation?: { confirmation_url?: string };
    payment_id?: string;
  };
  payment?: {
    id?: string;
  };
};

type JobMeta = {
  attempts?: number;
  maxAttempts?: number;
  runAt?: number;
  scheduledAt?: number;
  createdAt?: number;
  _processingStartedAt?: number;
  _recoveredAt?: number;
  failedAt?: number;
};

export type TelegramSendJob = {
  id: string;
  type: "telegram.send";
  payload: TelegramSendPayload;
} & JobMeta;

export type BookingReminderJob = {
  id: string;
  type: "booking.reminder";
  payload: BookingReminderPayload;
} & JobMeta;

export type VisualSearchIndexJob = {
  id: string;
  type: "visual_search_index";
  payload: VisualSearchIndexPayload;
} & JobMeta;

export type YookassaWebhookJob = {
  id: string;
  type: "yookassa.webhook";
  payload: YookassaWebhookPayload;
} & JobMeta;

export type SlotFreedJob = {
  id: string;
  type: "slot.freed";
  payload: SlotFreedPayload;
} & JobMeta;

export type MediaCleanupJob = {
  id: string;
  type: "media.cleanup";
  payload: MediaCleanupPayload;
} & JobMeta;

export type MrrSnapshotDailyJob = {
  id: string;
  type: "mrr.snapshot.daily";
  payload: MrrSnapshotDailyPayload;
} & JobMeta;

export type PlanEditedNotifyJob = {
  id: string;
  type: "notification.billing.plan-edited.mass";
  payload: PlanEditedNotifyPayload;
} & JobMeta;

export type Job =
  | TelegramSendJob
  | BookingReminderJob
  | VisualSearchIndexJob
  | SlotFreedJob
  | MediaCleanupJob
  | YookassaWebhookJob
  | MrrSnapshotDailyJob
  | PlanEditedNotifyJob;

export const TELEGRAM_SEND_JOB_TYPE = "telegram.send";
export const BOOKING_REMINDER_JOB_TYPE = "booking.reminder";
export const VISUAL_SEARCH_INDEX_JOB_TYPE = "visual_search_index";
export const SLOT_FREED_JOB_TYPE = "slot.freed";
export const MEDIA_CLEANUP_JOB_TYPE = "media.cleanup";
export const YOOKASSA_WEBHOOK_JOB_TYPE = "yookassa.webhook";
export const MRR_SNAPSHOT_DAILY_JOB_TYPE = "mrr.snapshot.daily";
export const PLAN_EDITED_NOTIFY_JOB_TYPE = "notification.billing.plan-edited.mass";
export const DEFAULT_JOB_MAX_ATTEMPTS = 5;

export function normalizeJobMeta<T extends Job>(job: T): T {
  const scheduledAt = job.scheduledAt ?? job.runAt;
  return {
    ...job,
    attempts: job.attempts ?? 0,
    maxAttempts: job.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    createdAt: job.createdAt ?? Date.now(),
    runAt: scheduledAt,
    scheduledAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTelegramSendPayload(value: unknown): value is TelegramSendPayload {
  if (!isRecord(value)) return false;
  return typeof value.chatId === "string" && typeof value.text === "string";
}

function isBookingReminderPayload(value: unknown): value is BookingReminderPayload {
  if (!isRecord(value)) return false;
  if (typeof value.bookingId !== "string" || value.bookingId.length === 0) return false;
  if (value.kind !== "REMINDER_24H" && value.kind !== "REMINDER_2H") return false;
  if (typeof value.startAtUtc !== "string" || value.startAtUtc.length === 0) return false;
  return true;
}

function isVisualSearchIndexPayload(value: unknown): value is VisualSearchIndexPayload {
  if (!isRecord(value)) return false;
  return typeof value.assetId === "string" && value.assetId.length > 0;
}

function isSlotFreedPayload(value: unknown): value is SlotFreedPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.providerId === "string" &&
    typeof value.providerName === "string" &&
    typeof value.slotStartAtUtc === "string" &&
    typeof value.slotEndAtUtc === "string" &&
    typeof value.timezone === "string"
  );
}

function isMediaCleanupPayload(value: unknown): value is MediaCleanupPayload {
  return isRecord(value);
}

function isMrrSnapshotDailyPayload(value: unknown): value is MrrSnapshotDailyPayload {
  return isRecord(value);
}

function isPlanEditedNotifyPayload(value: unknown): value is PlanEditedNotifyPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.planId === "string" &&
    typeof value.planCode === "string" &&
    typeof value.summary === "string"
  );
}

function isYookassaWebhookPayload(value: unknown): value is YookassaWebhookPayload {
  if (!isRecord(value)) return false;

  const object = value.object;
  if (typeof object !== "undefined" && !isRecord(object)) return false;

  const payment = value.payment;
  if (typeof payment !== "undefined" && !isRecord(payment)) return false;

  return true;
}

export function isJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.attempts !== "undefined" && typeof value.attempts !== "number") return false;
  if (typeof value.maxAttempts !== "undefined" && typeof value.maxAttempts !== "number") return false;
  if (typeof value.createdAt !== "undefined" && typeof value.createdAt !== "number") return false;
  if (typeof value.runAt !== "undefined" && typeof value.runAt !== "number") return false;
  if (typeof value.scheduledAt !== "undefined" && typeof value.scheduledAt !== "number") return false;
  if (
    typeof value._processingStartedAt !== "undefined" &&
    typeof value._processingStartedAt !== "number"
  ) {
    return false;
  }
  if (typeof value._recoveredAt !== "undefined" && typeof value._recoveredAt !== "number") return false;

  if (value.type === TELEGRAM_SEND_JOB_TYPE) {
    return isTelegramSendPayload(value.payload);
  }

  if (value.type === BOOKING_REMINDER_JOB_TYPE) {
    return isBookingReminderPayload(value.payload);
  }

  if (value.type === VISUAL_SEARCH_INDEX_JOB_TYPE) {
    return isVisualSearchIndexPayload(value.payload);
  }

  if (value.type === SLOT_FREED_JOB_TYPE) {
    return isSlotFreedPayload(value.payload);
  }

  if (value.type === MEDIA_CLEANUP_JOB_TYPE) {
    return isMediaCleanupPayload(value.payload);
  }

  if (value.type === YOOKASSA_WEBHOOK_JOB_TYPE) {
    return isYookassaWebhookPayload(value.payload);
  }

  if (value.type === MRR_SNAPSHOT_DAILY_JOB_TYPE) {
    return isMrrSnapshotDailyPayload(value.payload);
  }

  if (value.type === PLAN_EDITED_NOTIFY_JOB_TYPE) {
    return isPlanEditedNotifyPayload(value.payload);
  }

  return false;
}

export function createTelegramSendJob(
  payload: TelegramSendPayload,
  input?: Partial<
    Pick<
      TelegramSendJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): TelegramSendJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: TELEGRAM_SEND_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createBookingReminderJob(
  payload: BookingReminderPayload,
  input?: Partial<
    Pick<
      BookingReminderJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): BookingReminderJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: BOOKING_REMINDER_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createVisualSearchIndexJob(
  payload: VisualSearchIndexPayload,
  input?: Partial<
    Pick<
      VisualSearchIndexJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): VisualSearchIndexJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: VISUAL_SEARCH_INDEX_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createYookassaWebhookJob(
  payload: YookassaWebhookPayload,
  input?: Partial<
    Pick<
      YookassaWebhookJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): YookassaWebhookJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: YOOKASSA_WEBHOOK_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createSlotFreedJob(
  payload: SlotFreedPayload,
  input?: Partial<
    Pick<
      SlotFreedJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): SlotFreedJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: SLOT_FREED_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createMediaCleanupJob(
  payload: MediaCleanupPayload = {},
  input?: Partial<
    Pick<
      MediaCleanupJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): MediaCleanupJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: MEDIA_CLEANUP_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createMrrSnapshotDailyJob(
  payload: MrrSnapshotDailyPayload = {},
  input?: Partial<
    Pick<
      MrrSnapshotDailyJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): MrrSnapshotDailyJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: MRR_SNAPSHOT_DAILY_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}

export function createPlanEditedNotifyJob(
  payload: PlanEditedNotifyPayload,
  input?: Partial<
    Pick<
      PlanEditedNotifyJob,
      "id" | "attempts" | "maxAttempts" | "runAt" | "scheduledAt" | "createdAt"
    >
  >
): PlanEditedNotifyJob {
  return normalizeJobMeta({
    id: input?.id ?? randomUUID(),
    type: PLAN_EDITED_NOTIFY_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.scheduledAt ?? input?.runAt,
    scheduledAt: input?.scheduledAt ?? input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  });
}
