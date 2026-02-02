import { randomUUID } from "crypto";

export type TelegramSendPayload = {
  chatId: string;
  text: string;
};

export type TelegramSendJob = {
  id: string;
  type: "telegram.send";
  payload: TelegramSendPayload;
  attempts: number;
  maxAttempts: number;
  runAt?: number;
  createdAt: number;
};

export type Job = TelegramSendJob;

export const TELEGRAM_SEND_JOB_TYPE = "telegram.send";
export const DEFAULT_JOB_MAX_ATTEMPTS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTelegramSendPayload(value: unknown): value is TelegramSendPayload {
  if (!isRecord(value)) return false;
  return typeof value.chatId === "string" && typeof value.text === "string";
}

export function isJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  if (value.type !== TELEGRAM_SEND_JOB_TYPE) return false;
  if (typeof value.id !== "string") return false;
  if (!isTelegramSendPayload(value.payload)) return false;
  if (typeof value.attempts !== "number") return false;
  if (typeof value.maxAttempts !== "number") return false;
  if (typeof value.createdAt !== "number") return false;
  if (typeof value.runAt !== "undefined" && typeof value.runAt !== "number") return false;
  return true;
}

export function createTelegramSendJob(
  payload: TelegramSendPayload,
  input?: Partial<Pick<TelegramSendJob, "id" | "attempts" | "maxAttempts" | "runAt" | "createdAt">>
): TelegramSendJob {
  return {
    id: input?.id ?? randomUUID(),
    type: TELEGRAM_SEND_JOB_TYPE,
    payload,
    attempts: input?.attempts ?? 0,
    maxAttempts: input?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    runAt: input?.runAt,
    createdAt: input?.createdAt ?? Date.now(),
  };
}
