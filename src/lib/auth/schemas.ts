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

export const accountTypeQuerySchema = z.object({
  type: z.nativeEnum(AccountType),
});

export const roleQuerySchema = z.object({
  role: z.nativeEnum(AccountType),
});

export const emptyBodySchema = z.object({}).strict();
