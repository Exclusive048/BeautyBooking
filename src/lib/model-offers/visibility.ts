import { ProviderType, type Prisma } from "@prisma/client";
import { STUDIO_ACCEPTS_BOOKINGS_WHERE } from "@/lib/studio/accepts-bookings";

/**
 * Чьи модель-офферы видны публично: одно условие на ленту `/models`, страницу
 * оффера, подсказки городов и счётчик на главной.
 *
 * Раньше условие было «мастер опубликован». STUDIO-MASTER-PROFILES (этап 4):
 * оффер на студийную услугу принадлежит ПРОФИЛЮ МАСТЕРА В СТУДИИ, а у него
 * своей страницы нет и `isPublished = false` всегда — перенесённые при
 * разделении офферы пропали бы из выдачи, хотя запись по ним по-прежнему идёт
 * через студию. Для такого профиля условие — то же, что у студийной записи:
 * мастер активен в студии (не на паузе, приглашение принято), а студия
 * принимает записи.
 */
export const MODEL_OFFER_VISIBLE_MASTER_WHERE = {
  type: ProviderType.MASTER,
  OR: [
    { isPublished: true },
    {
      masterProfile: { is: null },
      studioId: { not: null },
      ownerUserId: { not: null },
      studioPaused: false,
      studio: { is: STUDIO_ACCEPTS_BOOKINGS_WHERE },
    },
  ],
} satisfies Prisma.ProviderWhereInput;
