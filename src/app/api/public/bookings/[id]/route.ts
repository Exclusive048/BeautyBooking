import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { resolveBookingSide } from "@/lib/auth/ownership";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { loadPublicBookingDto } from "@/lib/bookings/public-booking-read";
import { logError, getRequestId } from "@/lib/logging/logger";

/**
 * Карточка записи для экрана успеха виджета (обновление страницы, повторное
 * открытие) — для ВОШЕДШЕЙ стороны брони.
 *
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b, 2026-10-30): раньше id брони считался
 * «неявным токеном» — кто знал CUID, читал имя клиента, комментарий, время и
 * адрес визита. Id не секрет: он лежит в адресной строке (`?bookingId=`), в
 * реферере и в логах. Теперь читать здесь может только сессия стороны брони
 * (клиент, владелец, мастер-исполнитель, админ студии поверхности — правило
 * `resolveBookingSide`, то же, что у подтверждения и переноса). Гость читает
 * свою запись по подписанной ссылке: `GET /api/public/bookings/manage/[token]`.
 *
 * Чужим и анонимам — 404, как несуществующей брони: 403 подтверждал бы, что
 * запись с таким id есть.
 */
const NOT_FOUND_MESSAGE = "Запись не найдена.";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const p = params instanceof Promise ? await params : params;
  const requestId = getRequestId(req);

  if (!p.id || p.id.length < 8 || p.id.length > 64) {
    return jsonFail(400, "Такой записи нет. Проверьте ссылку.", "VALIDATION_ERROR");
  }

  try {
    const user = await getSessionUserFromRequest(req);
    if (!user) return jsonFail(404, NOT_FOUND_MESSAGE, "NOT_FOUND");

    const side = await resolveBookingSide(user.id, p.id);
    if (!side) return jsonFail(404, NOT_FOUND_MESSAGE, "NOT_FOUND");

    const booking = await loadPublicBookingDto(p.id);
    if (!booking) return jsonFail(404, NOT_FOUND_MESSAGE, "NOT_FOUND");

    return jsonOk({ booking });
  } catch (error) {
    logError("GET /api/public/bookings/[id] failed", {
      requestId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    // FIX-B18: см. близнеца в `../route.ts` — конверт вместо ручной сборки.
    return jsonFail(500, "Не удалось загрузить запись.", "INTERNAL_ERROR");
  }
}
