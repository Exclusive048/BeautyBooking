import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import { extractClientIp } from "@/lib/http/ip";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { readClientKeyParam, studioBookingHref } from "@/lib/studio/cabinet-catalog-json";
import { loadStudioClientDetail } from "@/features/studio-cabinet/clients/server/clients-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/clients/{clientKey}";

type RouteContext = { params: Promise<{ clientKey: string }> };

/**
 * MOBILE-STUDIO-C (G6) — карточка клиента студии без тарифного гейта:
 * сводка (как строка списка — то же окно CRM), ближайшая запись и до трёх
 * последних визитов со ссылками на карточку записи студии. Заметки, теги и
 * фото — PRO: `GET /api/studio/clients/{clientKey}/card?studioId=`.
 * Ключ — `user:<id>` или `phone:<номер>` в `encodeURIComponent`; неверный —
 * 400 `CLIENT_KEY_INVALID`, клиента нет у студии — 404. След чтения —
 * `studio.clients.detail`.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const { clientKey } = await ctx.params;
    const access = await requireStudioCabinetAdmin(user.id);

    const detail = await loadStudioClientDetail({
      studioId: access.studioId,
      actorUserId: user.id,
      actorIp: extractClientIp(req),
      clientKey: readClientKeyParam(clientKey),
    });
    if (!detail) return fail("Клиент не найден.", 404, "NOT_FOUND");

    return ok(
      {
        windowMonths: CRM_CLIENTS_WINDOW_MONTHS,
        timezone: detail.timezone,
        client: detail.client,
        nextBooking: detail.nextBooking
          ? { ...detail.nextBooking, href: studioBookingHref(detail.nextBooking.id) }
          : null,
        recentVisits: detail.recentVisits.map((visit) => ({
          ...visit,
          href: studioBookingHref(visit.bookingId),
        })),
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить карточку клиента. Попробуйте ещё раз.",
    });
  }
}
