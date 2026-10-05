/**
 * MOBILE-CLIENT-01 (B2) — адрес визита для клиента: первый НЕПУСТОЙ из
 * кандидатов (после `trim`), пустой — `null`.
 *
 * `Provider.address` — колонка NOT NULL, поэтому `??` между адресом мастера и
 * адресом записанного провайдера не срабатывал никогда: профиль мастера в
 * студии создаётся с `address: ""` (`studio/masters.service.ts`), и студийная
 * запись получала `""` — ни адреса студии в карточке, ни «Маршрута», ни
 * `LOCATION` в файле календаря. Порядок кандидатов задаёт вызывающий: сначала
 * тот, кто оказывает услугу, затем записанный провайдер (студия).
 *
 * Чистая функция — без Prisma, годится и для клиентского кода.
 */
export function resolveVisitAddress(
  ...candidates: ReadonlyArray<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
