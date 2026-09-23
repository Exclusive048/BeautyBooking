import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";

type DurationResult =
  | { ok: true; data: number }
  | { ok: false; status: number; message: string; code: string };

type MasterRow = { id: string; type: ProviderType; studioId: string | null };
type ServiceRow = {
  id: string;
  providerId: string;
  durationMin: number;
  isEnabled: boolean;
  isActive: boolean;
};
type OverrideRow = { durationOverrideMin: number | null; isEnabled: boolean };

const MASTER_SELECT = { id: true, type: true, studioId: true } as const;
const SERVICE_SELECT = {
  id: true,
  providerId: true,
  durationMin: true,
  isEnabled: true,
  isActive: true,
} as const;

/**
 * Единственное место, где живёт само правило. Загрузку строк делают две
 * обёртки ниже — поштучная и пакетная (PERF-08); расходиться им нельзя,
 * потому что от этого числа зависит и сетка слотов, и окно брони.
 *
 * Порядок проверок значим: он определяет, какой код ошибки увидит вызывающий
 * (нет мастера → `MASTER_NOT_FOUND` раньше, чем «нет услуги»), и пакетная
 * версия обязана отвечать теми же кодами, что поштучная.
 */
function decideServiceDuration(input: {
  master: MasterRow | null | undefined;
  service: ServiceRow | null | undefined;
  override: OverrideRow | null | undefined;
}): DurationResult {
  const { master, service, override } = input;

  if (!master || master.type !== ProviderType.MASTER) {
    return { ok: false, status: 404, message: "Мастер не найден.", code: "MASTER_NOT_FOUND" };
  }
  if (!service) {
    return { ok: false, status: 404, message: "Услуга не найдена.", code: "SERVICE_NOT_FOUND" };
  }
  if (!service.isEnabled || !service.isActive) {
    return { ok: false, status: 409, message: "Эта услуга сейчас недоступна. Выберите другую.", code: "SERVICE_DISABLED" };
  }

  // STUDIO-MASTER-OWN-BOOKINGS-01: собственная услуга мастера студии — как у
  // соло-мастера, без связи со студией.
  if (master.studioId && service.providerId === master.id) {
    return { ok: true, data: service.durationMin };
  }

  if (master.studioId) {
    if (service.providerId !== master.studioId) {
      return { ok: false, status: 400, message: "Эта услуга больше не в списке студии. Обновите страницу.", code: "SERVICE_INVALID" };
    }
    if (!override || override.isEnabled === false) {
      return { ok: false, status: 409, message: "Этот мастер не оказывает выбранную услугу. Выберите другую.", code: "SERVICE_INVALID" };
    }
    return { ok: true, data: override.durationOverrideMin ?? service.durationMin };
  }

  if (service.providerId !== master.id) {
    return { ok: false, status: 400, message: "Эта услуга больше не в вашем списке. Обновите страницу.", code: "SERVICE_INVALID" };
  }

  return { ok: true, data: service.durationMin };
}

export async function resolveServiceDuration(masterId: string, serviceId: string): Promise<DurationResult> {
  // PERF-24: строка мастера и строка услуги друг от друга не зависят —
  // читаются одним заходом, как это уже делает пакетная версия ниже. Ранний
  // выход по негодному мастеру сохранён: порядок отказов задаёт
  // `decideServiceDuration`, а не порядок запросов, поэтому ответ тот же
  // `MASTER_NOT_FOUND` — просто услуга к этому моменту уже прочитана.
  const [master, service] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: masterId },
      select: MASTER_SELECT,
    }),
    prisma.service.findUnique({
      where: { id: serviceId },
      select: SERVICE_SELECT,
    }),
  ]);
  if (!master || master.type !== ProviderType.MASTER) {
    return decideServiceDuration({ master: null, service: null, override: null });
  }

  // Оверрайд читается только там, где он вообще может решать, — ровно как
  // раньше: у соло-мастера третьего запроса не было.
  const needsOverride = Boolean(
    master.studioId && service && service.isEnabled && service.isActive && service.providerId === master.studioId
  );
  const override = needsOverride
    ? await prisma.masterService.findUnique({
        where: { masterProviderId_serviceId: { masterProviderId: master.id, serviceId } },
        select: { durationOverrideMin: true, isEnabled: true },
      })
    : null;

  return decideServiceDuration({ master, service, override });
}

/**
 * PERF-08 — та же длительность для НАБОРА мастеров и ОДНОЙ услуги.
 *
 * Публичный виджет студии звал поштучную версию в цикле по мастерам, то есть
 * 2–3 запроса на каждого, из которых чтение услуги было буквально одним и тем
 * же запросом M раз подряд (`serviceId` у всех общий). Здесь три запроса
 * независимо от числа мастеров.
 *
 * Возвращает Map по `masterId`; мастера, которого нет в наборе провайдеров,
 * в карте не будет — вызывающий трактует отсутствие так же, как `ok: false`.
 */
export async function resolveServiceDurations(
  masterIds: string[],
  serviceId: string
): Promise<Map<string, DurationResult>> {
  const out = new Map<string, DurationResult>();
  const unique = Array.from(new Set(masterIds));
  if (unique.length === 0) return out;

  const [masters, service, overrides] = await Promise.all([
    prisma.provider.findMany({ where: { id: { in: unique } }, select: MASTER_SELECT }),
    prisma.service.findUnique({ where: { id: serviceId }, select: SERVICE_SELECT }),
    prisma.masterService.findMany({
      where: { masterProviderId: { in: unique }, serviceId },
      select: { masterProviderId: true, durationOverrideMin: true, isEnabled: true },
    }),
  ]);

  const masterById = new Map(masters.map((master) => [master.id, master]));
  const overrideByMasterId = new Map(
    overrides.map((row) => [
      row.masterProviderId,
      { durationOverrideMin: row.durationOverrideMin, isEnabled: row.isEnabled },
    ])
  );

  for (const masterId of unique) {
    out.set(
      masterId,
      decideServiceDuration({
        master: masterById.get(masterId),
        service,
        override: overrideByMasterId.get(masterId),
      })
    );
  }

  return out;
}
