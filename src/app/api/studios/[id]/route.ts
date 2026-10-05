import { ok, fail } from "@/lib/api/response";
import { jsonFail } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { getStudioProviderById, updateStudioProviderProfile } from "@/lib/studios/studio";
import { isValidTimeZone } from "@/lib/schedule/timezone";
import { BOOKING_RULE_LIMITS } from "@/lib/schedule/editor-shared";
import { NextResponse } from "next/server";
import { z, type ZodError } from "zod";
import { findForbiddenWordsIssue, rejectForbiddenWords } from "@/lib/moderation/zod";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * MOBILE-POLISH — текст отказа у КАЖДОГО поля: раньше `details.issues` несли
 * сообщения Zod как есть («Too big: expected string to have <=120 characters»,
 * «Invalid input: expected number, received string»), и приложение показывало
 * их под полем. Ошибка типа поля — тот же текст, что и ошибка значения: человек
 * видит, что поправить, а не что прислал клиент.
 */
const FIELD_MESSAGES = {
  name: "Название — не длиннее 120 символов.",
  tagline: "Подзаголовок — не длиннее 240 символов.",
  address: "Проверьте адрес.",
  district: "Проверьте район.",
  categories: "Выберите не больше 20 категорий.",
  category: "Название категории — от 1 до 120 символов.",
  contactName: "Проверьте имя для связи.",
  contactPhone: "Проверьте телефон.",
  contactEmail: "Проверьте адрес почты.",
  socialVk: "Ссылка ВКонтакте — не длиннее 200 символов.",
  socialInstagram: "Ссылка Instagram — не длиннее 200 символов.",
  description: "Описание — не длиннее 2000 символов.",
  geo: "Выберите адрес из подсказок — так клиенты найдут вас на карте.",
  isPublished: "Проверьте, показывать ли страницу студии.",
  timezone: "Проверьте часовой пояс.",
  bannerAssetId: "Выберите обложку ещё раз.",
  catalogCoverAssetId: "Выберите главное фото ещё раз.",
  minBookingHoursAhead: "Запись заранее — целое число часов от 0 до 168.",
  maxBookingDaysAhead: `Запись вперёд — целое число дней от ${BOOKING_RULE_LIMITS.maxDaysAhead.min} до ${BOOKING_RULE_LIMITS.maxDaysAhead.max}.`,
  cancellationDeadlineHours: "Срок бесплатной отмены — целое число часов от 0 до 168.",
  lateCancelAction: "Выберите, что делать при поздней отмене.",
  acceptNewClients: "Проверьте, принимаете ли вы новых клиентов.",
  remindersEnabled: "Проверьте настройку напоминаний.",
  body: "Проверьте правильность заполнения полей.",
} as const;

const text = (message: string) => z.string({ error: message }).trim();
const integer = (message: string, min: number, max: number) =>
  z.number({ error: message }).int(message).min(min, message).max(max, message);

const updateSchema = z
  .object(
    {
      // FORBIDDEN-WORDS-01: у названия и подзаголовка не было потолка длины вовсе.
      name: text(FIELD_MESSAGES.name).max(120, FIELD_MESSAGES.name).superRefine(rejectForbiddenWords("name")).optional(),
      tagline: text(FIELD_MESSAGES.tagline)
        .max(240, FIELD_MESSAGES.tagline)
        .superRefine(rejectForbiddenWords("text"))
        .optional(),
      address: text(FIELD_MESSAGES.address).optional(),
      district: text(FIELD_MESSAGES.district).optional(),
      categories: z
        .array(
          text(FIELD_MESSAGES.category)
            .min(1, FIELD_MESSAGES.category)
            .max(120, FIELD_MESSAGES.category)
            .superRefine(rejectForbiddenWords("name")),
          { error: FIELD_MESSAGES.categories },
        )
        .max(20, FIELD_MESSAGES.categories)
        .optional(),
      contactName: text(FIELD_MESSAGES.contactName).nullable().optional(),
      contactPhone: text(FIELD_MESSAGES.contactPhone).nullable().optional(),
      contactEmail: text(FIELD_MESSAGES.contactEmail).email(FIELD_MESSAGES.contactEmail).nullable().optional(),
      // FEAT-PROVIDER-SOCIALS: raw input (URL or handle); normalized + host/scheme
      // validated server-side in updateStudioProviderProfile (the security boundary).
      socialVk: text(FIELD_MESSAGES.socialVk).max(200, FIELD_MESSAGES.socialVk).nullable().optional(),
      socialInstagram: text(FIELD_MESSAGES.socialInstagram)
        .max(200, FIELD_MESSAGES.socialInstagram)
        .nullable()
        .optional(),
      description: text(FIELD_MESSAGES.description)
        .max(2000, FIELD_MESSAGES.description)
        .superRefine(rejectForbiddenWords("text"))
        .nullable()
        .optional(),
      geoLat: z.number({ error: FIELD_MESSAGES.geo }).nullable().optional(),
      geoLng: z.number({ error: FIELD_MESSAGES.geo }).nullable().optional(),
      isPublished: z.boolean({ error: FIELD_MESSAGES.isPublished }).optional(),
      // FIX-10: was `z.string().trim().optional()` — an empty/garbage tz persisted
      // and then 500'd `partsFromDate` across calendar/booking surfaces. Mirror the
      // master schema: bounded length + IANA validity.
      timezone: text(FIELD_MESSAGES.timezone)
        .min(3, FIELD_MESSAGES.timezone)
        .max(64, FIELD_MESSAGES.timezone)
        .refine(isValidTimeZone, { message: FIELD_MESSAGES.timezone })
        .optional(),
      bannerAssetId: text(FIELD_MESSAGES.bannerAssetId).nullable().optional(),
      // CATALOG-MAIN-PHOTO: главное фото карточки каталога — из портфолио студии.
      catalogCoverAssetId: text(FIELD_MESSAGES.catalogCoverAssetId)
        .min(1, FIELD_MESSAGES.catalogCoverAssetId)
        .max(64, FIELD_MESSAGES.catalogCoverAssetId)
        .nullable()
        .optional(),
      // FIX-STUDIO-POLICY-EDITABLE: правила записи студии. Границы — те же, что у
      // мастерского редактора расписания (`editor-shared`), чтобы одно и то же
      // значение не оказывалось валидным на одной поверхности и отвергнутым на
      // другой. Запись делегируется `applyProviderBookingPolicy` (rule 5).
      minBookingHoursAhead: integer(FIELD_MESSAGES.minBookingHoursAhead, 0, 168).optional(),
      maxBookingDaysAhead: integer(
        FIELD_MESSAGES.maxBookingDaysAhead,
        BOOKING_RULE_LIMITS.maxDaysAhead.min,
        BOOKING_RULE_LIMITS.maxDaysAhead.max,
      ).optional(),
      cancellationDeadlineHours: integer(FIELD_MESSAGES.cancellationDeadlineHours, 0, 168).nullable().optional(),
      lateCancelAction: z.enum(["none", "reminder", "fine"], { error: FIELD_MESSAGES.lateCancelAction }).optional(),
      acceptNewClients: z.boolean({ error: FIELD_MESSAGES.acceptNewClients }).optional(),
      remindersEnabled: z.boolean({ error: FIELD_MESSAGES.remindersEnabled }).optional(),
    },
    { error: FIELD_MESSAGES.body },
  )
  .refine(
    (data) =>
      data.name !== undefined ||
      data.tagline !== undefined ||
      data.address !== undefined ||
      data.district !== undefined ||
      data.categories !== undefined ||
      data.contactName !== undefined ||
      data.contactPhone !== undefined ||
      data.contactEmail !== undefined ||
      data.socialVk !== undefined ||
      data.socialInstagram !== undefined ||
      data.description !== undefined ||
      data.geoLat !== undefined ||
      data.geoLng !== undefined ||
      data.isPublished !== undefined ||
      data.timezone !== undefined ||
      data.bannerAssetId !== undefined ||
      data.catalogCoverAssetId !== undefined ||
      data.minBookingHoursAhead !== undefined ||
      data.maxBookingDaysAhead !== undefined ||
      data.cancellationDeadlineHours !== undefined ||
      data.lateCancelAction !== undefined ||
      data.acceptNewClients !== undefined ||
      data.remindersEnabled !== undefined,
    { message: "Заполните хотя бы одно поле." }
  );

/**
 * MOBILE-STUDIO-C (team) — отказ валидации тела человеческим текстом, а не
 * машинным «поле: сообщение; …» (`formatZodError`), которое форма показывала
 * как есть: запрещённые слова — их текст, пустой патч — «Заполните хотя бы
 * одно поле.», остальное — общий текст и `details.issues` для подсветки полей.
 * Статус и код прежние (400 `VALIDATION_ERROR`).
 *
 * MOBILE-POLISH: тексты `issues` — русские у каждого поля (`FIELD_MESSAGES`),
 * и рядом `error.fieldErrors` — `{ поле: текст }` по имени поля (первая ошибка
 * поля), как у остальных форм приложения.
 */
function bodyValidationFailure(error: ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "input",
    message: issue.message,
    code: issue.code,
  }));
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  const forbidden = findForbiddenWordsIssue(error);
  // Единственная проверка уровня всего тела — «хотя бы одно поле».
  const emptyPatch = error.issues.find((issue) => issue.code === "custom" && issue.path.length === 0);
  return jsonFail(
    400,
    forbidden?.message ?? emptyPatch?.message ?? FIELD_MESSAGES.body,
    "VALIDATION_ERROR",
    { issues },
    Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  );
}

function coordsRequired() {
  // FIX-B14: прежняя форма клала МАШИННЫЙ КОД в поле `error`, где UI ждёт
  // объект `{ message, code }` — то есть сообщения не было вовсе, а гейт
  // `check:error-message-lang` этого не видел (ответ собран мимо `fail()`).
  return fail("Укажите адрес — выберите его из подсказок.", 400, "ADDRESS_COORDS_REQUIRED");
}

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsed = providerIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsed.data;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  const studio = await getStudioProviderById(id);
  if (!studio) return fail("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  return ok({ studio });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsedParams = providerIdParamSchema.safeParse(params);
  if (!parsedParams.success) {
    return fail(formatZodError(parsedParams.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsedParams.data;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsedBody = updateSchema.safeParse(body);
  if (!parsedBody.success) {
    return bodyValidationFailure(parsedBody.error);
  }
  const payload = parsedBody.data;
  const addressProvided = payload.address !== undefined;
  const hasGeoLat = payload.geoLat !== undefined;
  const hasGeoLng = payload.geoLng !== undefined;
  if (hasGeoLat !== hasGeoLng) {
    return coordsRequired();
  }
  if (addressProvided) {
    const trimmed = payload.address?.trim() ?? "";
    if (trimmed) {
      if (!hasGeoLat || payload.geoLat === null || payload.geoLng === null) {
        return coordsRequired();
      }
    } else {
      if (!hasGeoLat || payload.geoLat !== null || payload.geoLng !== null) {
        return coordsRequired();
      }
    }
  }

  // Surface AppError from the service (e.g. R2-02-B publish gate ADDRESS_REQUIRED)
  // as a clean 4xx instead of an unhandled 500.
  let updated;
  try {
    updated = await updateStudioProviderProfile(id, payload);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
  if (!updated) return fail("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  return ok({ studio: updated });
}
