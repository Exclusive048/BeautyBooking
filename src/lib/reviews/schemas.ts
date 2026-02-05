import { z } from "zod";

export const createReviewSchema = z.object({
  bookingId: z.string().trim().min(1, "bookingId is required"),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional(),
});

export const listReviewsQuerySchema = z.object({
  targetType: z.enum(["provider", "studio"]),
  targetId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const canLeaveQuerySchema = z.object({
  bookingId: z.string().trim().min(1, "bookingId is required"),
});

export const reviewIdParamSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
});

export const reviewReplySchema = z.object({
  text: z.string().trim().min(1, "text is required").max(1500),
});

export const reviewReportSchema = z.object({
  comment: z.string().trim().min(1, "comment is required").max(1500),
});
