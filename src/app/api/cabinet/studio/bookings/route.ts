import { BookingStatus } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { encodeOffsetCursor, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";
import { toStudioBookingListItem } from "@/features/studio-cabinet/bookings/server/booking-json";
import {
  loadStudioBookingsKpis,
  loadStudioMasterOptions,
} from "@/features/studio-cabinet/bookings/server/bookings-kpis.service";
import { listStudioBookings } from "@/features/studio-cabinet/bookings/server/bookings-list.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/bookings";

/** Группы статусов журнала: сохранённые статусы, которые попадают в фильтр. */
const STATUS_GROUPS = {
  awaiting: [BookingStatus.NEW, BookingStatus.PENDING, BookingStatus.CHANGE_REQUESTED],
  confirmed: [BookingStatus.CONFIRMED, BookingStatus.PREPAID, BookingStatus.STARTED, BookingStatus.IN_PROGRESS],
  finished: [BookingStatus.FINISHED],
  cancelled: [BookingStatus.REJECTED, BookingStatus.CANCELLED],
  no_show: [BookingStatus.NO_SHOW],
} as const satisfies Record<string, readonly BookingStatus[]>;

const querySchema = z.object({
  range: z.enum(["today", "tomorrow", "week", "all"]).default("today"),
  status: z.enum(["all", "awaiting", "confirmed", "finished", "cancelled", "no_show"]).default("all"),
  master: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * MOBILE-STUDIO-C (ops) — журнал записей студии (`/cabinet/studio/bookings`,
 * `listStudioBookings` + `loadStudioBookingsKpis` + `loadStudioMasterOptions`)
 * постранично: счётчики диапазонов, KPI журнала, мастера для фильтра и записи
 * с вычисляемым статусом и действиями. Телефона в элементах нет — он в
 * карточке записи. Только владелец / администратор студии.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const now = new Date();

    const [list, kpis, masters] = await Promise.all([
      listStudioBookings({
        studioId: access.studioId,
        filters: {
          range: query.range,
          status: query.status === "all" ? "all" : [...STATUS_GROUPS[query.status]],
          masterId: query.master ?? "all",
          search: query.q || undefined,
        },
        page: { offset, limit: query.limit },
      }),
      loadStudioBookingsKpis(access.studioId),
      loadStudioMasterOptions(access.studioId),
    ]);

    return ok(
      {
        studioId: access.studioId,
        timezone: list.timezone,
        range: query.range,
        status: query.status,
        rangeCounts: list.rangeCounts,
        kpis,
        masters,
        items: list.items.map((row) => toStudioBookingListItem(row, now)),
        nextCursor: list.nextCursor ? encodeOffsetCursor(offset + list.items.length) : null,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить записи. Попробуйте ещё раз.",
    });
  }
}
