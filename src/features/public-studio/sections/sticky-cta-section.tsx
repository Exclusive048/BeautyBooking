import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import { StudioFloatingBooking } from "@/features/public-studio/studio-booking-dialog";

type Props = {
  studioId: string;
  bookingParams?: { master?: string; masterId?: string; serviceId?: string };
};

/**
 * Плавающая «Записаться» страницы студии (BOOKING-WIDGET-DIALOG): открывает
 * окно записи с первого шага. Раньше здесь была «К услугам» — ссылка на якорь
 * `#studio-services`, которого на странице нет, то есть кнопка не делала ничего
 * (FIX-STUDIO-02 переименовал её из «Записаться онлайн», но цель не починил).
 *
 * Здесь же — автооткрытие окна по ссылке записи (`?serviceId=`, `?master=`):
 * секция и так знает, владелец ли смотрит, а владельцу записываться к себе
 * нельзя — ему не рендерится ни кнопка, ни окно.
 */
export async function StudioStickyCta({ studioId, bookingParams }: Props) {
  const isOwner = await isViewerProfileOwner(studioId);
  if (isOwner) return null;
  return (
    <StudioFloatingBooking
      request={{
        serviceId: bookingParams?.serviceId,
        masterId: bookingParams?.masterId,
        masterKey: bookingParams?.master,
      }}
    />
  );
}
