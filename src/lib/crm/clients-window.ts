// PERF-06 (AUDIT-CAMPAIGN-02 п.3): окно чтения броней для CRM-группировки.
//
// Вход группировки клиентов (`groupBookings`) читал ВСЮ историю броней
// арендатора без окна и без take — главный OOM-кандидат приложения (студия с
// 5 000 броней грузила их все в один SSR-рендер; пагинация не спасает — даже
// страница из 50 клиентов собирается из полного набора броней). Окно режет
// сам вход; KPI и счётчики вкладок считаются из того же оконного набора,
// поэтому разойтись с таблицей им не из чего (by construction).
//
// Пользователь видит срез, а не всю историю, — поэтому у окна ОБЯЗАТЕЛЬНАЯ
// видимая подпись (UI_TEXT.cabinetMaster.clients.windowNote) на каждой
// поверхности, чей вход окно режет. Менять окно и подпись — только вместе.
//
// Модуль намеренно БЕЗ импортов: его читают и server-сервисы, и клиентские
// шапки кабинетов; соседний `crm/clients.ts` клиенту запрещён — value-импорт
// `BookingStatus` из @prisma/client тащит в бандл рантайм Prisma (PERF-11,
// rule 13).
export const CRM_CLIENTS_WINDOW_MONTHS = 24;

export function crmClientsWindowStart(now: Date = new Date()): Date {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - CRM_CLIENTS_WINDOW_MONTHS);
  return start;
}
