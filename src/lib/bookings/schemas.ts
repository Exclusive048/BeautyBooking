import { z } from "zod";

export const bookingsQuerySchema = z.object({
  providerId: z.string().min(1, "Provider id is required"),
});

export const createBookingSchema = z.object({
  providerId: z.string().min(1, "Provider id is required"),
  serviceId: z.string().min(1, "Service id is required"),
  masterProviderId: z.string().min(1).optional(),
  startAtUtc: z.string().min(1).optional(),
  endAtUtc: z.string().min(1).optional(),
  slotLabel: z.string().trim().min(1, "Slot is required"),
  clientName: z.string().trim().min(1, "Client name is required"),
  clientPhone: z.string().trim().min(1, "Client phone is required"),
  comment: z.string().trim().nullable().optional(),
  silentMode: z.boolean().optional(),
  referencePhotoAssetId: z.string().trim().min(1).nullable().optional(),
  bookingAnswers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        questionText: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(1000),
      })
    )
    .max(5)
    .optional(),
});
