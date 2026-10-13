import { AppError } from "@/lib/api/errors";
import {
  resolveStoredSocialLink,
  SOCIAL_FIELD,
  SOCIAL_KINDS,
  socialHostLabel,
  type SocialField,
  type SocialKind,
} from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS: сырой ввод ссылки → значение для записи (безопасный
 * адрес либо `null`) или 400 на чужом/опасном вводе. Сервер — главная граница
 * проверки (предпросмотр в кабинетах повторяет её). SOCIAL-TG-MAX: одна копия
 * для кабинетов мастера и студии — до неё правило жило в двух сервисах.
 */
export function resolveSocialOrThrow(kind: SocialKind, raw: string | null | undefined): string | null {
  const result = resolveStoredSocialLink(kind, raw);
  if ("invalid" in result) {
    const name = UI_TEXT.social.kinds[kind].label;
    throw new AppError(
      `Не удалось сохранить ссылку на ${name}. Укажите адрес страницы на ${socialHostLabel(kind)}.`,
      400,
      "INVALID_SOCIAL_LINK",
    );
  }
  return result.value;
}

export type SocialFieldsInput = { [F in SocialField]?: string | null };

/**
 * Все присланные поля ссылок → данные для `provider.update`. Непришедшее поле
 * в ответе отсутствует (не меняется), пустое — `null` (очищается). Проверка
 * идёт до записи: недопустимая ссылка не доходит до базы.
 */
export function resolveSocialFieldsOrThrow(input: SocialFieldsInput): SocialFieldsInput {
  const data: SocialFieldsInput = {};
  for (const kind of SOCIAL_KINDS) {
    const field = SOCIAL_FIELD[kind];
    const raw = input[field];
    if (raw !== undefined) data[field] = resolveSocialOrThrow(kind, raw);
  }
  return data;
}
