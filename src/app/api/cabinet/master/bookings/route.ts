import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { loadMasterBookingItems } from "@/lib/master/booking-items.service";
import { getMasterBookingsForKanban, type ColumnId } from "@/lib/master/bookings.service";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { verifyClientKeyToken } from "@/lib/master/client-key-token";
import { paginateByOffset, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/bookings";

const COLUMNS = ["pending", "confirmed", "today", "done", "cancelled"] as const satisfies readonly ColumnId[];

const querySchema = z.object({
  column: z.enum(COLUMNS).default("pending"),
  q: z.string().trim().max(80).optional(),
  tab: z.enum(["all", "new", "regular"]).default("all"),
  /** Токен истории клиента (`historyToken` карточки клиента или записи). */
  client: z.string().trim().min(1).max(512).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * MOBILE-MASTER-C — канбан записей мастера (`/cabinet/master/bookings`,
 * `getMasterBookingsForKanban`) постранично по колонке.
 *
 * Колонки и окна — как на вебе: `pending` — ждут подтверждения или ответа на
 * перенос; `confirmed` — подтверждены (60 дней вперёд); `today` — «Сегодня / в
 * работе» (приём уже начался); `done` — завершены за 60 дней, новые сверху;
 * `cancelled` — отменены, отклонены и неявки за 30 дней (до 50). Фильтры
 * `q` / `tab` / `client` — те же, что у веба, и применяются до разбиения на
 * колонки: `counts` и `stats` считаются по отфильтрованному набору.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const workProfiles = await getMasterWorkProfiles(user.id);
    const masterId = workProfiles.personalId;

    let clientKey: string | undefined;
    if (query.client) {
      const verified = verifyClientKeyToken({ token: query.client, masterProviderId: masterId });
      if (!verified) {
        throw new AppError(
          "Ссылка на историю клиента устарела. Откройте карточку клиента ещё раз.",
          400,
          "VALIDATION_ERROR",
          { issues: [{ path: "client", message: "Токен не принят.", code: "custom" }] },
        );
      }
      clientKey = verified;
    }

    const now = new Date();
    const board = await getMasterBookingsForKanban({
      masterId,
      workProfiles,
      now,
      filters: { search: query.q ?? "", tab: query.tab, clientKey },
    });

    const column = board.columns[query.column];
    const page = paginateByOffset(column, offset, query.limit);
    const reviewRatingById = new Map(page.items.map((item) => [item.id, item.reviewRating]));
    const items = await loadMasterBookingItems({
      ids: page.items.map((item) => item.id),
      workProfileIds: workProfiles.allIds,
      now,
    });

    return ok(
      {
        column: query.column,
        timezone: board.timezone,
        showWorkContext: board.showWorkContext,
        counts: {
          pending: board.columns.pending.length,
          confirmed: board.columns.confirmed.length,
          today: board.columns.today.length,
          done: board.columns.done.length,
          cancelled: board.columns.cancelled.length,
        },
        stats: board.stats,
        items: items.map((item) => ({ ...item, reviewRating: reviewRatingById.get(item.id) ?? null })),
        nextCursor: page.nextCursor,
        total: page.total,
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
