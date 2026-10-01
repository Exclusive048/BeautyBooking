import { z } from "zod";
import { rejectForbiddenWords } from "@/lib/moderation/zod";
import { normalizeRussianPhone } from "@/lib/phone/russia";

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

/** Имя человека — публично (подпись под отзывом), поэтому без запрещённых слов. */
const optionalName = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).superRefine(rejectForbiddenWords("name")).nullable().optional());

const birthDateSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be YYYY-MM-DD")
    .nullable()
    .optional()
);

/**
 * PHONE-CLAIM-01 — телефон снова принимается, но как ЗАЯВКА, а не владение.
 *
 * История: SECURITY-EXPOSURE-AUDIT-01 #2 убрал `phone` отсюда целиком — тогда
 * непроверенный номер работал ключом матчинга (гостевые брони, инвайты,
 * phone-OTP-вход), и запись без OTP была вектором перехвата. Решение владельца
 * (2026-08-31): номер нужен как контакт и без SMS-шлюза, поэтому вместо запрета
 * записи выключена СИЛА непроверенного номера — модель «заявка ≠ владение»
 * (зеркало инв. #41): `phoneVerifiedAt` ставит только phone-OTP, а все места
 * матчинга принимают лишь подтверждённый номер либо guest-class профиль.
 * Запись идёт через единственный примитив `claimPhoneForUser`
 * (`lib/auth/phone-claim.ts`) — он сбрасывает отметку владения при смене и
 * освобождает guest-class держателя.
 *
 * Канонизация — на границе разбора (форма `bookingCreateSchema`, второго
 * подхода не заводим): вглубь уезжает только `+7XXXXXXXXXX` либо null.
 */
const phoneClaimField = z.preprocess(
  emptyToNull,
  z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .max(40)
        .transform((value) => normalizeRussianPhone(value))
        .refine((value): value is string => value !== null, {
          message: "Проверьте номер телефона: нужен формат +7 900 000-00-00.",
        }),
    ])
    .optional(),
);

export const profileUpdateSchema = z.object({
  // LOGIC-24: `displayName` и `address` в схеме БЫЛИ, а роут вырезал их дважды
  // — из сырого тела до разбора и из результата после. То есть схема описывала
  // поля, которых эндпоинт не принимает, клиент получал `200 OK` на
  // проигнорированную операцию, а `updateMeProfile` продолжал их писать (и
  // получал `undefined`, потому что роут их к тому моменту уже удалил). Из трёх
  // слоёв каждый утверждал своё. Поля убраны из схемы — Zod отбрасывает их
  // ключи, и лишних зачисток в роуте больше нет. Решение «сюда не пишутся» не
  // меняется: обратное было бы новой возможностью продукта, а не фиксом.
  phone: phoneClaimField,
  email: optionalText(120),
  firstName: optionalName(80),
  lastName: optionalName(80),
  middleName: optionalName(80),
  birthDate: birthDateSchema,
  emailNotificationsEnabled: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
