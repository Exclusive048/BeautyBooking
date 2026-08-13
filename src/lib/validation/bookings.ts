import { z } from "zod";
import { consentFlagsSchema } from "@/lib/legal/consent-flags-schema";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * GUEST-PHONE-CANON-BOOKINGS-ROUTE (FIX-B13) — телефон канонизируется НА ГРАНИЦЕ
 * разбора, поэтому всё, что ниже, работает с одной формой номера.
 *
 * До этого поле было `z.string().trim().min(1).max(40)` — то есть формата не
 * проверяло вовсе, и `POST /api/bookings` оставался единственным из четырёх
 * гостевых входов без нормализатора (LOGIC-30 закрыл три). Идентичность профиля
 * при этом не страдала: чокпоинт `findOrCreateGuestUserByPhone` нормализует сам.
 * Страдало то, что ключуется СТРОКОЙ: «8 999 123-45-67» уезжало в
 * `Booking.clientPhone` дословно, а поиск по телефону (CRM-карточка, релинк
 * гостевых броней — `buildPhoneVariantsForMatch`) перебирает варианты
 * `+7…/7…/8…`, но не формы с пробелами и дефисами. То есть бронь сохранялась и
 * становилась ненаходимой — молча.
 *
 * Почему в схеме, а не в роуте (как у `/api/public/bookings`): семантика та же
 * (400 `VALIDATION_ERROR` через `formatZodError`), но забыть её нельзя — у
 * `bookingCreateSchema` ровно один потребитель, и канонический вид попадает и в
 * строку брони, и в namespace идемпотентности/рейт-лимита, без второго сайта,
 * который надо помнить. Форма проверки — та же, что уже принята в
 * `studio/schemas.ts` (transform + refine), второго подхода не заводим.
 */
const clientPhoneField = z
  .string()
  .trim()
  .min(1, "Не указан телефон клиента.")
  .max(40)
  .transform((value) => normalizeRussianPhone(value))
  .refine((value): value is string => value !== null, {
    message: "Проверьте номер телефона.",
  });

const dateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Некорректная дата." });

const bookingAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  questionText: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1000),
});

export const bookingCreateSchema = z
  .object({
    providerId: z.string().trim().min(1, "Не указан провайдер."),
    serviceId: z.string().trim().min(1, "Не указана услуга."),
    hotSlotId: z.string().trim().min(1).nullable().optional(),
    masterProviderId: z.string().trim().min(1).optional(),
    startAtUtc: dateString.optional(),
    endAtUtc: dateString.optional(),
    slotLabel: z.string().trim().min(1, "Не указано окошко.").max(120),
    clientName: z.string().trim().min(1, "Не указано имя клиента.").max(120),
    clientPhone: clientPhoneField,
    comment: z.string().trim().max(500).nullable().optional(),
    silentMode: z.boolean().optional(),
    referencePhotoAssetId: z.string().trim().min(1).nullable().optional(),
    bookingAnswers: z.array(bookingAnswerSchema).max(5).optional(),
    // RKN-FIX-02 — this endpoint also serves GUEST bookings (the public studio
    // flow posts here). Same optional-in-shape / required-for-guests contract
    // as `publicBookingCreateSchema`.
    consent: consentFlagsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endAtUtc && !value.startAtUtc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startAtUtc обязателен, если указан endAtUtc.",
        path: ["startAtUtc"],
      });
    }
    if (value.startAtUtc && value.endAtUtc) {
      const start = Date.parse(value.startAtUtc);
      const end = Date.parse(value.endAtUtc);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endAtUtc должен быть позже startAtUtc.",
          path: ["endAtUtc"],
        });
      }
    }
  });

export const bookingCancelSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const bookingRescheduleSchema = z
  .object({
    startAtUtc: dateString,
    endAtUtc: dateString,
    slotLabel: z.string().trim().min(1).max(120),
    silentMode: z.boolean().optional(),
    comment: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.startAtUtc);
    const end = Date.parse(value.endAtUtc);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endAtUtc должен быть позже startAtUtc.",
        path: ["endAtUtc"],
      });
    }
  });
