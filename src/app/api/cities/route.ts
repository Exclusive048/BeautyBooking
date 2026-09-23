import { NextResponse } from "next/server";
import { publicReferenceCacheInit } from "@/lib/api/cache-headers";
import { jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";

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
 * CITY-LIST-FRESH-01: заголовок — общий для публичных справочников
 * (`publicReferenceCacheInit`), путь — в `PUBLIC_REFERENCE_API_PATHS`. Раньше
 * здесь стоял собственный `public, max-age=300, s-maxage=300`, а в списке
 * путей роута не было: прокси на протухшем access-токене прикладывал к этому
 * `public`-ответу `Set-Cookie` с сессией — ровно то, от чего список заведён
 * (PERF-13). Попутно браузер держит ответ 60 с вместо 300: город, где только
 * что появился мастер, доходит до селектора быстрее.
 */

export async function GET(req: Request) {
  try {
    const cities = await prisma.city.findMany({
      where: {
        isActive: true,
        OR: [
          // VISIBILITY-DEFAULT-01: город появляется вместе с первым провайдером,
          // которого в нём можно НАЙТИ (тот же предикат, что у каталога).
          { providers: { some: catalogVisibleProviderWhere() } },
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

    return NextResponse.json({ ok: true, data: { items: cities } }, publicReferenceCacheInit());
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
