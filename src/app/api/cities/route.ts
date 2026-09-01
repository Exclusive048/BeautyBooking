import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Public list of cities visible in the city selector and first-visit popup.
 *
 * Filter rules:
 *   - `isActive: true` — admin can hide a city without deleting it.
 *   - затем ЛИБО есть опубликованный провайдер, ЛИБО город заведён человеком
 *     (`autoCreated: false`).
 *
 * 🔴 Вторая половина добавлена PWA-FIX-01 (2026-09-01), и вот почему прежнего
 * `providers.some(isPublished)` было мало. Фильтр защищает от одного: город,
 * ВЫРОСШИЙ из геокодера (`autoCreated: true` — его создаёт `detect-city` по
 * адресу провайдера), не должен всплывать в селекторе, пока в нём никого нет.
 * Но он же прятал и города, которые администратор завёл ОСОЗНАННО — через
 * /admin/cities или боевой `npm run seed:reference`. На свежем проде это дало
 * состояние «городов нет вообще» (замер 2026-09-01: ответ `[]`), при котором
 * селектор в шапке не рендерится, а первый-визитный попап предлагал выбрать
 * из пустого списка на каждой навигации.
 *
 * Условие «человек подтвердил» — не ослабление, а возврат к смыслу правила:
 * скрываем НЕподтверждённое и пустое, а не всё пустое. Города-призраки из
 * геокодера по-прежнему не видны до первого опубликованного мастера.
 *
 * Cached for 5 minutes via response headers — selector is dropdown-frequent
 * and the underlying data changes slowly.
 */
const CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

export async function GET(req: Request) {
  try {
    const cities = await prisma.city.findMany({
      where: {
        isActive: true,
        OR: [
          { providers: { some: { isPublished: true } } },
          { autoCreated: false },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        nameGenitive: true,
        latitude: true,
        longitude: true,
      },
    });

    return NextResponse.json(
      { ok: true, data: { items: cities } },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cities failed", {
        requestId: getRequestId(req),
        route: "GET /api/cities",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
