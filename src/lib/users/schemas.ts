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
  // LOGIC-24: `displayName` и `address` в схеме БЫЛИ, а роут вырезал их дважды
  // — из сырого тела до разбора и из результата после. То есть схема описывала
  // поля, которых эндпоинт не принимает, клиент получал `200 OK` на
  // проигнорированную операцию, а `updateMeProfile` продолжал их писать (и
  // получал `undefined`, потому что роут их к тому моменту уже удалил). Из трёх
  // слоёв каждый утверждал своё. Поля убраны из схемы — Zod отбрасывает их
  // ключи так же, как `phone` ниже, и лишних зачисток в роуте больше нет.
  // Решение «сюда не пишутся» не меняется: обратное было бы новой возможностью
  // продукта, а не фиксом.
  //
  // SECURITY-EXPOSURE-AUDIT-01 #2: `phone` is the identity/login primitive and
  // the key guest bookings + studio invites are matched on. It must NOT be
  // writable here without OTP verification — an unverified write is an account-
  // takeover vector. There is no verified phone-change flow yet; until one
  // exists (backlog: PHONE-CHANGE-VERIFIED-FLOW), phone is only established at
  // signup via the OTP login flow. Removed from the accepted fields entirely;
  // Zod strips an incoming `phone` key rather than persisting it.
  email: optionalText(120),
  firstName: optionalText(80),
  lastName: optionalText(80),
  middleName: optionalText(80),
  birthDate: birthDateSchema,
  emailNotificationsEnabled: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
