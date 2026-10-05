import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { loadStudioCabinetShellExtras } from "@/features/studio-cabinet/schedule/server/shell-extras.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/booking-options";

/**
 * MOBILE-STUDIO-C (ops) — мастера и услуги для создания и переноса записи:
 * тот же загрузчик, что у веб-диалога «Новая запись»
 * (`loadStudioCabinetShellExtras`), но только то, что можно записать, —
 * активные мастера (приняли приглашение, не на паузе) и включённые активные
 * услуги, с длительностью и ценой у каждого мастера (что запишет
 * `createStudioBooking`). Только владелец / администратор студии.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const extras = await loadStudioCabinetShellExtras(access.studioId);

    const activeMasters = extras.scheduleMasters.filter((master) => master.isAvailable);
    const activeMasterIds = new Set(activeMasters.map((master) => master.id));
    const serviceIds = new Set(extras.services.map((service) => service.id));

    return ok(
      {
        studioId: access.studioId,
        timezone: access.timezone,
        masters: activeMasters.map((master) => ({
          id: master.id,
          name: master.name,
          avatarUrl: master.avatarUrl,
          serviceIds: master.serviceIds.filter((id) => serviceIds.has(id)),
        })),
        services: extras.services.map((service) => ({
          id: service.id,
          name: service.name,
          durationMin: service.durationMin,
          priceKopeks: service.priceKopeks,
          masterIds: service.masterIds.filter((id) => activeMasterIds.has(id)),
          masters: service.masterOffers.filter((offer) => activeMasterIds.has(offer.masterId)),
        })),
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить мастеров и услуги. Попробуйте ещё раз.",
    });
  }
}
