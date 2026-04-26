import { z } from "zod";

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

const birthDateSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be YYYY-MM-DD")
    .nullable()
    .optional()
);

export const profileUpdateSchema = z.object({
  displayName: optionalText(120),
  phone: optionalText(32),
  email: optionalText(120),
  firstName: optionalText(80),
  lastName: optionalText(80),
  middleName: optionalText(80),
  birthDate: birthDateSchema,
  address: optionalText(240),
  emailNotificationsEnabled: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
