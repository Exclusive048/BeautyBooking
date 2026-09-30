import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import { ProviderType } from "@prisma/client";

type StudioMasterRecord = {
  id: string;
  name: string;
  studioId: string | null;
};

type StudioLocation = {
  cityId: string | null;
  address: string;
  district: string;
  geoLat: number | null;
  geoLng: number | null;
};

async function ensureStudio(
  studioId: string
): Promise<Result<{ id: string; timezone: string; location: StudioLocation }>> {
  const studio = await prisma.provider.findUnique({
    where: { id: studioId },
    select: {
      id: true,
      type: true,
      timezone: true,
      cityId: true,
      address: true,
      district: true,
      geoLat: true,
      geoLng: true,
    },
  });
  if (!studio || studio.type !== ProviderType.STUDIO) {
    return { ok: false, status: 404, message: "Студия не найдена.", code: "STUDIO_NOT_FOUND" };
  }
  return {
    ok: true,
    data: {
      id: studio.id,
      timezone: studio.timezone,
      location: {
        cityId: studio.cityId ?? null,
        address: studio.address,
        district: studio.district,
        geoLat: studio.geoLat ?? null,
        geoLng: studio.geoLng ?? null,
      },
    },
  };
}

/**
 * VISIBILITY-DEFAULT-01 — в каталоге мастера находят по ГОРОДУ, а приглашённый
 * мастер рождается без адреса (заготовка в `studio/masters.service.ts`), и ни
 * приём приглашения, ни привязка город не ставили: мастер, пришедший в студию
 * без своего кабинета, не находился нигде, а его кабинет просил «добавить
 * адрес», который на деле адрес студии. Поэтому мастер без своего города
 * получает город и адрес студии — как уже получает её часовой пояс. Свой адрес
 * мастера (соло-кабинет до вступления) не перезаписывается никогда.
 */
function inheritStudioLocation(master: { cityId?: string | null }, location: StudioLocation) {
  if (master.cityId || !location.cityId) return {};
  return {
    cityId: location.cityId,
    address: location.address,
    district: location.district,
    geoLat: location.geoLat,
    geoLng: location.geoLng,
  };
}

export async function listStudioMasters(studioId: string): Promise<Result<StudioMasterRecord[]>> {
  const studio = await ensureStudio(studioId);
  if (!studio.ok) return studio;

  const masters = await prisma.provider.findMany({
    where: { studioId, type: ProviderType.MASTER },
    select: { id: true, name: true, studioId: true },
    orderBy: { createdAt: "asc" },
  });

  return { ok: true, data: masters };
}

export async function attachMasterToStudio(
  studioId: string,
  masterProviderId: string
): Promise<Result<StudioMasterRecord>> {
  const studio = await ensureStudio(studioId);
  if (!studio.ok) return studio;

  // SEC-27: правило «привязать можно только мастера БЕЗ студии либо уже этой же»
  // живёт в запросе, а не в ветке `if (master.studioId && master.studioId !== studioId)`.
  // Ту форму `lib/studio/tenancy.ts` прямо называет багом (NULL-PERMISSIVE):
  // при `studioId === null` условие ложно, и ветка «перепривязать» оказывается
  // общей для «свободного мастера» и для «мастера, которого никто не спрашивал».
  // Сегодня это не эксплуатируется — HTTP-хендлер прямой привязки удалён, а
  // единственный вызывающий (приём приглашения) передаёт СОБСТВЕННЫЙ provider
  // принимающего, — но это инвариант уровня ревью: любой новый вызывающий молча
  // возвращал бы захват solo-мастера. Теперь условие нельзя не заметить: оно в
  // `where`.
  const master = await prisma.provider.findFirst({
    where: {
      id: masterProviderId,
      type: ProviderType.MASTER,
      OR: [{ studioId: null }, { studioId }],
    },
    select: { id: true, name: true, studioId: true, timezone: true, cityId: true },
  });

  if (!master) {
    // Решение уже принято запросом; здесь только выбирается текст ответа —
    // «мастера нет» и «мастер занят» это разные ответы для принимающего
    // приглашение, и схлопывать их в один было бы регрессом флоу.
    const existingMasters = await prisma.provider.count({
      where: { id: masterProviderId, type: ProviderType.MASTER },
    });
    return existingMasters > 0
      ? { ok: false, status: 409, message: "Мастер уже состоит в студии.", code: "MASTER_ALREADY_ASSIGNED" }
      : { ok: false, status: 404, message: "Мастер не найден.", code: "MASTER_NOT_FOUND" };
  }

  if (master.studioId === studioId) {
    // STUDIO-MASTER-TZ-01: приглашённый мастер создаётся уже с `studioId` этой
    // студии (staged-профиль в `studio/masters.service.ts`), поэтому приём
    // приглашения приходит именно сюда — и пояс синхронизируется и здесь.
    const sync = {
      ...(master.timezone !== studio.data.timezone ? { timezone: studio.data.timezone } : {}),
      ...inheritStudioLocation(master, studio.data.location),
    };
    if (Object.keys(sync).length > 0) {
      await prisma.provider.update({
        where: { id: master.id },
        data: sync,
        select: { id: true },
      });
    }
    return { ok: true, data: { id: master.id, name: master.name, studioId: master.studioId } };
  }

  // Между чтением и записью мастера могла принять другая студия (два
  // приглашения, принятые одновременно). Состояние повторяется в `where`, чтобы
  // гонка кончалась отказом, а не тихой перепривязкой.
  const attached = await prisma.provider.updateMany({
    where: { id: master.id, type: ProviderType.MASTER, studioId: null },
    // STUDIO-MASTER-TZ-01: мастер студии работает в её часовом поясе. Рабочие
    // часы мастера проверяются в ЕГО поясе (`studio/bookings.service.ts`), а
    // календарь студии рисуется в поясе студии; расхождение сдвигало и проверку,
    // и публичные слоты мастера на разницу поясов.
    // STUDIO-PAUSE-SPLIT-01: присоединившийся мастер активен (место в команде
    // уже проверено у приглашения), даже если свою страницу он скрыл.
    data: {
      studioId,
      timezone: studio.data.timezone,
      studioPaused: false,
      ...inheritStudioLocation(master, studio.data.location),
    },
  });

  if (attached.count === 0) {
    return { ok: false, status: 409, message: "Мастер уже состоит в студии.", code: "MASTER_ALREADY_ASSIGNED" };
  }

  return { ok: true, data: { id: master.id, name: master.name, studioId } };
}
