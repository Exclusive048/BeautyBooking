import { z } from "zod";
import { timeToMinutes } from "@/lib/schedule/time";

const dateLocalRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeLocalRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateLocalSchema = z.string().trim().regex(dateLocalRegex, "Invalid date format");
const timeLocalSchema = z.string().trim().regex(timeLocalRegex, "Invalid time format");

const requirementsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(5);

function ensureValidTimeRange(start: string, end: string) {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin === null || endMin === null) return false;
  return startMin < endMin;
}

export const createModelOfferSchema = z
  .object({
    masterServiceId: z.string().trim().min(1),
    dateLocal: dateLocalSchema,
    timeRangeStartLocal: timeLocalSchema,
    timeRangeEndLocal: timeLocalSchema,
    price: z.number().min(0).optional().nullable(),
    requirements: requirementsSchema.optional(),
    extraBusyMin: z.number().int().min(0).max(240).optional(),
  })
  .refine(
    (value) => ensureValidTimeRange(value.timeRangeStartLocal, value.timeRangeEndLocal),
    {
      message: "Invalid time range",
      path: ["timeRangeEndLocal"],
    }
  );

export const updateModelOfferSchema = z
  .object({
    status: z.enum(["ACTIVE", "CLOSED", "ARCHIVED"]).optional(),
    price: z.number().min(0).optional().nullable(),
    requirements: requirementsSchema.optional(),
    timeRangeStartLocal: timeLocalSchema.optional(),
    timeRangeEndLocal: timeLocalSchema.optional(),
    extraBusyMin: z.number().int().min(0).max(240).optional(),
  })
  .refine(
    (value) => {
      if (!value.timeRangeStartLocal && !value.timeRangeEndLocal) return true;
      const start = value.timeRangeStartLocal ?? "00:00";
      const end = value.timeRangeEndLocal ?? "23:59";
      return ensureValidTimeRange(start, end);
    },
    {
      message: "Invalid time range",
      path: ["timeRangeEndLocal"],
    }
  );

export const proposeTimeSchema = z.object({
  proposedTimeLocal: timeLocalSchema,
});

export const applyModelOfferSchema = z.object({
  consentToShoot: z.literal(true),
  note: z.string().trim().max(500).optional(),
  mediaIds: z.array(z.string().trim().min(1)).min(1).max(3),
});

export const confirmApplicationSchema = z.object({});

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const publicModelOffersQuerySchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

export function isTimeWithinRange(input: {
  value: string;
  start: string;
  end: string;
}): boolean {
  const valueMin = timeToMinutes(input.value);
  const startMin = timeToMinutes(input.start);
  const endMin = timeToMinutes(input.end);
  if (valueMin === null || startMin === null || endMin === null) return false;
  return valueMin >= startMin && valueMin < endMin;
}

export function normalizeRequirements(input?: string[] | null): string[] {
  if (!input || input.length === 0) return [];
  return input.map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 5);
}

export function normalizePrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}
