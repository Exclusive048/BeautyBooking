import "server-only";

import { headers } from "next/headers";
import { userAgent } from "next/server";
import type { ScheduleView } from "@/features/master/components/schedule/schedule-view-state";

/**
 * PWA-UX-BATCH-01 — вид расписания по умолчанию выводится из УСТРОЙСТВА на
 * сервере, а не из ширины окна на клиенте.
 *
 * Почему не `matchMedia` в клиентском компоненте: страница серверная, и
 * решать «день или неделя» после гидратации значило бы либо рендерить обе
 * раскладки и прятать одну CSS-ом (дубли карточек в DOM, `?focus=` уезжает в
 * скрытый контейнер), либо показывать недельную сетку и перещёлкивать на
 * день через секунду. Явный `?view=` всегда сильнее эвристики.
 *
 * Сигнал — `Sec-CH-UA-Mobile` (Chromium шлёт его на каждый запрос без
 * opt-in), запасной — разбор User-Agent (`userAgent` из `next/server`).
 */
export async function resolveDefaultScheduleView(): Promise<ScheduleView> {
  const h = await headers();
  const mobileHint = h.get("sec-ch-ua-mobile");
  if (mobileHint === "?1") return "day";
  if (mobileHint === "?0") return "week";
  const { device } = userAgent({ headers: h });
  return device.type === "mobile" ? "day" : "week";
}
