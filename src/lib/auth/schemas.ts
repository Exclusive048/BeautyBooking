import { z } from "zod";
import { AccountType } from "@prisma/client";
import { normalizePhone } from "@/lib/auth/otp";

const phoneSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizePhone(value) : value),
  z.string().min(8, "Phone is too short")
);

export const otpRequestSchema = z.object({
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().min(4, "Code is too short"),
});

const telegramIdSchema = z.preprocess(
  (value) => (typeof value === "string" || typeof value === "number" ? Number(value) : value),
  z.number().int().positive("Telegram id must be a positive integer")
);

const telegramAuthDateSchema = z.preprocess(
  (value) => (typeof value === "string" || typeof value === "number" ? Number(value) : value),
  z.number().int().positive("Auth date must be a unix timestamp")
);

export const telegramLoginSchema = z.object({
  id: telegramIdSchema,
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().optional(),
  username: z.string().trim().optional(),
  photo_url: z.string().url().optional(),
  auth_date: telegramAuthDateSchema,
  hash: z.string().trim().min(1, "Hash is required"),
});

export const accountTypeQuerySchema = z.object({
  type: z.nativeEnum(AccountType),
});

export const roleQuerySchema = z.object({
  role: z.nativeEnum(AccountType),
});

export const emptyBodySchema = z.object({}).strict();
