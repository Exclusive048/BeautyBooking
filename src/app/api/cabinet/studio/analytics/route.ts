import { z } from "zod";
import { FEATURE_REQUIRED_PLAN } from "@/features/analytics/domain/guards";
import { buildStudioAnalyticsLocks } from "@/features/studio-cabinet/analytics/lib/locks";
import type { StudioAnalyticsPeriodId } from "@/features/studio-cabinet/analytics/lib/types";
import { getStudioAnalyticsFeatures } from "@/features/studio-cabinet/analytics/server/analytics-features";
import { loadStudioAnalyticsView } from "@/features/studio-cabinet/analytics/server/analytics-view.service";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/analytics";

/** Период приложения → период веба (`year` — скользящие 365 дней). */
const PERIOD_TO_VIEW: Record<"7d" | "30d" | "90d" | "365d", StudioAnalyticsPeriodId> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  "365d": "year",
};

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
  view: z.enum(["overview", "masters", "services", "clients"]).default("overview"),
  compare: z.enum(["on", "off"]).default("on"),
});

/**
 * MOBILE-STUDIO-C (G8) — аналитика студии (`/cabinet/studio/analytics`) тем же
 * сервисом, что у веба (`loadStudioAnalyticsView`): KPI всегда, данные — только
 * выбранной вкладки (`view`). Раздел, закрытый тарифом, приходит `null`, а
 * причина — в `locks.*` в форме ошибки `FEATURE_GATE` (как у
 * `/api/analytics/*`). Деньги — копейки, доли (`occupancy`, `returnRate`,
 * `share`) — 0..1, подписи точек выручки — локальные даты салона
 * (`YYYY-MM-DD`). `topClients[].clientKey` — ключ карточки клиента
 * (`user:<id>`, `GET /api/cabinet/studio/clients/{clientKey}`).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const access = await requireStudioCabinetAdmin(user.id);

    const features = await getStudioAnalyticsFeatures(user.id);
    const data = await loadStudioAnalyticsView({
      userId: user.id,
      period: PERIOD_TO_VIEW[query.period],
      view: query.view,
      compare: query.compare === "on",
      features,
    });

    return ok(
      {
        period: query.period,
        view: data.view,
        compare: data.compare,
        periodLabel: data.periodLabel,
        timezone: access.timezone,
        features: data.features,
        locks: buildStudioAnalyticsLocks(data.features, FEATURE_REQUIRED_PLAN),
        kpi: data.kpi,
        overview: data.overview,
        masters: data.masters,
        services: data.services,
        clients: data.clients
          ? {
              segments: data.clients.segments,
              topClients: data.clients.topClients.map((row) => ({
                ...row,
                clientKey: `user:${row.clientKey}`,
              })),
            }
          : null,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить аналитику. Попробуйте ещё раз.",
    });
  }
}
