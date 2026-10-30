import { headers } from "next/headers";
import { EventsHistory } from "@/features/admin-cabinet/dashboard/components/events-history";
import {
  ADMIN_EVENTS_HISTORY_PAGE,
  parseAdminEventCategory,
} from "@/features/admin-cabinet/dashboard/lib/event-categories";
import { getAdminEvents } from "@/features/admin-cabinet/dashboard/server/events.service";
import { getSessionUser } from "@/lib/auth/session";
import { extractClientIp } from "@/lib/http/ip";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ category?: string }>;

/** ADMIN-EVENTS-02 — «История событий»: все события платформы по разделам. */
export default async function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const category = parseAdminEventCategory(params.category);

  // RKN-FIX-10: чей это просмотр — решает страница (сессия уже здесь).
  // Route-group layout уже отсёк не-админов: здесь идентификация, а не гейт.
  const actor = await getSessionUser();
  const events = await getAdminEvents({
    limit: ADMIN_EVENTS_HISTORY_PAGE,
    category,
    actor: { userId: actor?.id ?? null, ip: extractClientIp({ headers: await headers() }) },
  });

  return (
    <EventsHistory
      // Новый раздел — новый список: догруженное и пришедшее опросом не переносится.
      key={category}
      category={category}
      initial={events.items}
      initialNextCursor={events.nextCursor}
      initialAsOfMs={events.asOfMs}
    />
  );
}
