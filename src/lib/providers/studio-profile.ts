import { ProviderType, type Prisma } from "@prisma/client";
import { STUDIO_ACCEPTS_BOOKINGS_WHERE } from "@/lib/studio/accepts-bookings";

export type ActiveStudioProfile = {
  /** `Provider.id` профиля мастера в студии — им студия выбирает мастера в записи. */
  studioProfileId: string;
  /** `Provider.id` студии. */
  studioProviderId: string;
  studioName: string;
  /** Публичный адрес студии; `null`, если страница студии не публична. */
  studioPublicUsername: string | null;
};

/**
 * STUDIO-MASTER-PROFILES (этап 4) — профиль мастера в студии для ЕГО ЛИЧНОЙ
 * страницы. После разделения у личного профиля нет `studioId`, и «Часть студии
 * «…»», «Запись через студию» и ссылка «через студию» выводятся отсюда: из
 * профиля того же человека в студии, активного (не на паузе) в студии, которая
 * принимает записи. Скрытая студия или пауза — связи на личной странице нет
 * (то же правило, что было у одного профиля: STUDIO-PAUSE-SPLIT-01,
 * STUDIO-HIDDEN-MASTER-SERVICES).
 *
 * Фрагмент `select` для строки ЛИЧНОГО профиля — чтобы страница получала его
 * тем же запросом, что и сам профиль, без лишнего обращения к БД на каждый
 * просмотр (сторож — `providers/studio-master-services.test.ts`).
 */
export const ACTIVE_STUDIO_PROFILE_SELECT = {
  owner: {
    select: {
      providers: {
        where: {
          type: ProviderType.MASTER,
          masterProfile: { is: null },
          studioPaused: false,
          studio: { is: STUDIO_ACCEPTS_BOOKINGS_WHERE },
        },
        select: {
          id: true,
          studio: { select: { id: true, name: true, publicUsername: true, isPublished: true } },
        },
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
    },
  },
} satisfies Prisma.ProviderSelect;

type ActiveStudioProfileRow = {
  owner?: {
    providers: Array<{
      id: string;
      studio: { id: string; name: string; publicUsername: string | null; isPublished: boolean } | null;
    }>;
  } | null;
};

export function pickActiveStudioProfile(row: ActiveStudioProfileRow | null | undefined): ActiveStudioProfile | null {
  const profile = row?.owner?.providers[0];
  if (!profile?.studio) return null;
  return {
    studioProfileId: profile.id,
    studioProviderId: profile.studio.id,
    studioName: profile.studio.name,
    studioPublicUsername: profile.studio.isPublished ? profile.studio.publicUsername : null,
  };
}
