import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { ensureStudioTeamLimit } from "@/lib/studio/team-limits";
import { assertBelongsToStudio } from "@/lib/studio/tenancy";
import { MembershipStatus, ProviderType } from "@prisma/client";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { normalizeInviteEmail } from "@/lib/invites/access";
import { discardStagedMaster } from "@/lib/invites/service";
import {
  buildStudioMasterServicesMatrix,
  type StudioMasterServicesMatrixRow,
} from "@/lib/studio/team-cabinet-json";

export type StudioMasterServiceItem = {
  serviceId: string;
  serviceTitle: string;
  isEnabled: boolean;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  commissionPct: number | null;
};

export type StudioMasterDetails = {
  id: string;
  name: string;
  isActive: boolean;
  tagline: string;
  services: StudioMasterServiceItem[];
};

type StudioContext = {
  id: string;
  providerId: string;
  provider: { timezone: string };
};

async function getStudioContext(studioId: string): Promise<StudioContext> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) {
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
  }
  return studio;
}

export type StudioMasterListItem = {
  id: string;
  name: string;
  isActive: boolean;
  title: string;
  status: "PENDING" | "ACTIVE";
  phone: string | null;
};

export async function listStudioMasters(studioId: string): Promise<{ masters: StudioMasterListItem[] }> {
  const studio = await getStudioContext(studioId);
  const [masters, pendingInvites] = await Promise.all([
    prisma.provider.findMany({
      where: {
        type: "MASTER",
        studioId: studio.providerId,
      },
      select: {
        id: true,
        name: true,
        studioPaused: true,
        tagline: true,
        contactPhone: true,
        contactEmail: true,
        ownerUserId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.studioInvite.findMany({
      where: {
        studioId: studio.id,
        status: MembershipStatus.PENDING,
      },
      select: {
        phone: true,
        email: true,
      },
    }),
  ]);

  const pendingPhones = new Set(pendingInvites.map((invite) => invite.phone).filter(Boolean));
  // STUDIO-INVITE-EMAIL-01: заготовка под приглашение по почте — тоже ожидающая.
  const pendingEmails = new Set(pendingInvites.map((invite) => invite.email).filter(Boolean));
  const isPendingInvite = (master: { contactPhone: string | null; contactEmail: string | null }) =>
    (!!master.contactPhone && pendingPhones.has(master.contactPhone)) ||
    (!!master.contactEmail && pendingEmails.has(normalizeInviteEmail(master.contactEmail)));

  return {
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      // STUDIO-PAUSE-SPLIT-01: активность в студии, а не личная видимость.
      isActive: isStudioMasterActive(master),
      title: master.tagline,
      status: !master.ownerUserId && isPendingInvite(master) ? "PENDING" : "ACTIVE",
      phone: master.contactPhone ?? null,
    })),
  };
}

export async function createStudioMaster(input: {
  studioId: string;
  displayName: string;
  /** STUDIO-INVITE-EMAIL-01: ровно один из двух контактов (проверяет схема). */
  phone?: string | null;
  email?: string | null;
  title: string;
  invitedByUserId: string;
}): Promise<{ id: string; inviteId: string; shouldNotifyInvite: boolean }> {
  const studio = await getStudioContext(input.studioId);
  const email = input.email?.trim().toLowerCase() || null;
  const phone = email ? null : (input.phone ?? null);
  if (!email && !phone) {
    throw new AppError("Укажите телефон или почту мастера.", 400, "VALIDATION_ERROR");
  }
  // Заготовка мастера и приглашение ищутся по тому контакту, на который
  // приглашение выписано.
  const contact = email ? { contactEmail: email } : { contactPhone: phone as string };
  const inviteKey = email
    ? { studioId_email: { studioId: studio.id, email } }
    : { studioId_phone: { studioId: studio.id, phone: phone as string } };

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.provider.findFirst({
      where: {
        type: ProviderType.MASTER,
        studioId: studio.providerId,
        ...contact,
      },
      select: { id: true, ownerUserId: true },
      orderBy: { createdAt: "asc" },
    });

    if (existing?.ownerUserId) {
      throw new AppError(
        email ? "Мастер с такой почтой уже добавлен." : "Мастер с таким телефоном уже добавлен.",
        409,
        "ALREADY_EXISTS",
      );
    }

    const master = existing
      ? await tx.provider.update({
          where: { id: existing.id },
          data: {
            name: input.displayName.trim(),
            tagline: input.title.trim(),
            isPublished: false,
            ...contact,
          },
          select: { id: true },
        })
      : await tx.provider.create({
          data: {
            type: "MASTER",
            name: input.displayName.trim(),
            tagline: input.title.trim(),
            studioId: studio.providerId,
            ownerUserId: null,
            isPublished: false,
            ...contact,
            address: "",
            district: "",
            // STUDIO-MASTER-TZ-01: пояс студии, а не пояс по умолчанию (Москва):
            // рабочие часы мастера и его слоты считаются в его поясе, и у
            // екатеринбургской студии они съезжали на 2 часа.
            timezone: studio.provider.timezone,
            categories: [],
            availableToday: false,
          },
          select: { id: true },
        });

    const existingInvite = await tx.studioInvite.findUnique({
      where: inviteKey,
      select: { id: true, status: true },
    });

    const invite = await tx.studioInvite.upsert({
      where: inviteKey,
      update: {
        status: MembershipStatus.PENDING,
        invitedByUserId: input.invitedByUserId,
      },
      create: {
        studioId: studio.id,
        phone,
        email,
        status: MembershipStatus.PENDING,
        invitedByUserId: input.invitedByUserId,
      },
      select: { id: true },
    });

    return {
      master,
      inviteId: invite.id,
      shouldNotifyInvite: !existingInvite || existingInvite.status !== MembershipStatus.PENDING,
    };
  });

  return { id: created.master.id, inviteId: created.inviteId, shouldNotifyInvite: created.shouldNotifyInvite };
}

export async function getStudioMasterDetails(input: {
  studioId: string;
  masterId: string;
}): Promise<StudioMasterDetails> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: "MASTER", studioId: studio.providerId },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      studioPaused: true,
      tagline: true,
      masterServices: {
        select: {
          serviceId: true,
          isEnabled: true,
          priceOverride: true,
          durationOverrideMin: true,
          commissionPct: true,
          service: { select: { name: true, title: true } },
        },
      },
    },
  });

  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  return {
    id: master.id,
    name: master.name,
    isActive: isStudioMasterActive(master),
    tagline: master.tagline,
    services: master.masterServices.map((item) => ({
      serviceId: item.serviceId,
      serviceTitle: item.service.title?.trim() || item.service.name,
      isEnabled: item.isEnabled,
      priceOverride: item.priceOverride ?? null,
      durationOverrideMin: item.durationOverrideMin ?? null,
      commissionPct: item.commissionPct ?? null,
    })),
  };
}

/**
 * MOBILE-STUDIO-C (team) — матрица услуг мастера для карточки в приложении:
 * КАЖДАЯ услуга студии (и выключенные) с базовой ценой и длительностью и
 * строкой мастера (`MasterService`: выполняет ли, свои цена/длительность,
 * комиссия). `getStudioMasterDetails` отдаёт только существующие строки
 * мастера — по ней нельзя включить услугу, которой у мастера ещё нет.
 * Правка — `PUT /api/studio/masters/{id}/services` (`bulkUpdateMasterServices`).
 *
 * @throws 404 STUDIO_NOT_FOUND · 404 MASTER_NOT_FOUND
 */
export async function getStudioMasterServicesMatrix(input: {
  studioId: string;
  masterId: string;
}): Promise<StudioMasterServicesMatrixRow[]> {
  await assertBelongsToStudio("master", input.masterId, input.studioId);

  const [services, masterRows] = await Promise.all([
    prisma.service.findMany({
      where: { studioId: input.studioId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        title: true,
        isActive: true,
        price: true,
        basePrice: true,
        durationMin: true,
        baseDurationMin: true,
      },
    }),
    prisma.masterService.findMany({
      where: { masterProviderId: input.masterId, service: { studioId: input.studioId } },
      select: {
        serviceId: true,
        isEnabled: true,
        priceOverride: true,
        durationOverrideMin: true,
        commissionPct: true,
      },
    }),
  ]);

  return buildStudioMasterServicesMatrix(services, masterRows);
}

export async function bulkUpdateMasterServices(input: {
  studioId: string;
  masterId: string;
  items: Array<{
    serviceId: string;
    isEnabled: boolean;
    priceOverride?: number | null;
    durationOverrideMin?: number | null;
    commissionPct?: number | null;
  }>;
}): Promise<{ updated: number }> {
  if (input.items.length === 0) return { updated: 0 };

  // SECURITY-EXPOSURE-AUDIT-01 #1 (R1c): the masterId was trusted (no scoping),
  // so any studio could rewrite/disable another provider's service config.
  // Scope the master to this studio, and each service to this studio's catalogue.
  await assertBelongsToStudio("master", input.masterId, input.studioId);
  const serviceIds = Array.from(new Set(input.items.map((item) => item.serviceId)));
  await Promise.all(
    serviceIds.map((serviceId) => assertBelongsToStudio("service", serviceId, input.studioId))
  );

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.masterService.upsert({
        where: { masterProviderId_serviceId: { masterProviderId: input.masterId, serviceId: item.serviceId } },
        create: {
          studioId: input.studioId,
          masterProviderId: input.masterId,
          masterId: input.masterId,
          serviceId: item.serviceId,
          isEnabled: item.isEnabled,
          priceOverride: item.priceOverride ?? null,
          durationOverrideMin: item.durationOverrideMin ?? null,
          ...(typeof item.commissionPct === "number" || item.commissionPct === null
            ? { commissionPct: item.commissionPct }
            : {}),
        },
        update: {
          studioId: input.studioId,
          masterId: input.masterId,
          isEnabled: item.isEnabled,
          priceOverride: item.priceOverride ?? null,
          durationOverrideMin: item.durationOverrideMin ?? null,
          ...(typeof item.commissionPct === "number" || item.commissionPct === null
            ? { commissionPct: item.commissionPct }
            : {}),
        },
      })
    )
  );

  return { updated: input.items.length };
}

export async function updateStudioMasterProfile(input: {
  studioId: string;
  masterId: string;
  displayName?: string;
  tagline?: string;
  /** STUDIO-EDIT-MASTER-PROFILE-01: пустая строка очищает описание. */
  description?: string;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: {
      id: input.masterId,
      type: "MASTER",
      studioId: studio.providerId,
    },
    select: { id: true, ownerUserId: true, studioPaused: true },
  });
  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  // BC-CAP: re-activating a claimed-but-paused master (ownerUserId set,
  // studioPaused true → false) makes it ACTIVE and consumes a seat. Enforce the
  // team cap at this transition. Activating an unclaimed stub (ownerUserId null)
  // does NOT make it ACTIVE, so it's not gated; pausing (isActive false) frees a
  // seat and is never gated.
  if (input.isActive === true && master.ownerUserId !== null && master.studioPaused) {
    await ensureStudioTeamLimit(input.studioId);
  }

  await prisma.provider.update({
    where: { id: master.id },
    data: {
      ...(input.displayName ? { name: input.displayName } : {}),
      ...(input.tagline ? { tagline: input.tagline } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      // STUDIO-PAUSE-SPLIT-01: пауза — только в студии. Личную страницу мастера
      // (`isPublished`) студия не трогает: он продолжает продавать свои услуги.
      ...(typeof input.isActive === "boolean" ? { studioPaused: !input.isActive } : {}),
    },
  });

  return { id: master.id };
}

/**
 * FIX-STUDIO-02 (F7) — revoke a still-pending master invite from the studio
 * cabinet. Only an UNCLAIMED stub is revocable (`ownerUserId === null`); a
 * claimed master (invite already accepted) must be paused/removed instead.
 *
 * Two effects, both required, mirroring {@link rejectStudioInvite}:
 *  1. mark the PENDING `StudioInvite` as `LEFT` — blocks a later accept
 *     (`acceptStudioInvite` returns `INVITE_REVOKED` for `LEFT`), so the SMS
 *     link can't be used after revocation;
 *  2. delete the unclaimed stub Provider (guarded `ownerUserId: null`) — the
 *     team list derives `INVITED` for ANY owner-less stub, so marking the
 *     invite alone would leave the card. The stub consumed no seat (ACTIVE-only
 *     counting), so nothing is freed.
 *
 * @returns the revoked invite id (for the revoked-notification), or null when
 *   no pending invite backed the stub.
 * @throws 404 STUDIO_NOT_FOUND / MASTER_NOT_FOUND · 409 MASTER_NOT_INVITED
 */
export async function revokeStudioMasterInvite(input: {
  studioId: string;
  masterId: string;
}): Promise<{ inviteId: string | null }> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: ProviderType.MASTER, studioId: studio.providerId },
    select: { id: true, ownerUserId: true, contactPhone: true, contactEmail: true },
  });
  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }
  if (master.ownerUserId) {
    throw new AppError("У мастера нет активного приглашения.", 409, "MASTER_NOT_INVITED");
  }

  const invite = await findStudioMasterInvite(studio.id, master);

  if (invite && invite.status === MembershipStatus.PENDING) {
    await prisma.studioInvite.update({
      where: { id: invite.id },
      data: { status: MembershipStatus.LEFT },
      select: { id: true },
    });
  }
  // Заготовка уходит тем же путём, что при принятии и отказе, — вместе с фото,
  // которые админ мог загрузить в редакторе профиля мастера. Удаляется только
  // строка без владельца: условие стоит в самой записи.
  await discardStagedMaster(master.id);

  return { inviteId: invite?.id ?? null };
}

/**
 * Приглашение, выписанное на контакт заготовки мастера.
 *
 * STUDIO-INVITE-EMAIL-01: заготовка несёт ровно тот контакт, на который
 * выписано приглашение (`createStudioMaster`). Поиск только по телефону
 * приглашение по почте не находил: заготовка удалялась, а приглашение
 * оставалось PENDING — приглашённый по-прежнему мог его принять.
 */
async function findStudioMasterInvite(
  studioId: string,
  master: { contactPhone: string | null; contactEmail: string | null },
): Promise<{ id: string; status: MembershipStatus } | null> {
  const inviteEmail = normalizeInviteEmail(master.contactEmail);
  if (inviteEmail) {
    return prisma.studioInvite.findUnique({
      where: { studioId_email: { studioId, email: inviteEmail } },
      select: { id: true, status: true },
    });
  }
  if (master.contactPhone) {
    return prisma.studioInvite.findUnique({
      where: { studioId_phone: { studioId, phone: master.contactPhone } },
      select: { id: true, status: true },
    });
  }
  return null;
}

/**
 * MOBILE-STUDIO-C (team) — ожидающее приглашение заготовки мастера для
 * «Отправить приглашение ещё раз». Повторный `POST /api/studio/masters` на тот
 * же контакт уведомление не шлёт (только новое приглашение), поэтому повтор —
 * отдельное действие. Канал — тот контакт, на который выписано приглашение.
 *
 * @throws 404 STUDIO_NOT_FOUND / MASTER_NOT_FOUND · 409 MASTER_NOT_INVITED
 *   (приглашение принято, отозвано или его нет)
 */
export async function findPendingStudioMasterInvite(input: {
  studioId: string;
  masterId: string;
}): Promise<{ inviteId: string; channel: "PHONE" | "EMAIL" }> {
  const studio = await getStudioContext(input.studioId);

  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: ProviderType.MASTER, studioId: studio.providerId },
    select: { id: true, ownerUserId: true, contactPhone: true, contactEmail: true },
  });
  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }
  const invite = master.ownerUserId ? null : await findStudioMasterInvite(studio.id, master);
  if (!invite || invite.status !== MembershipStatus.PENDING) {
    throw new AppError("У мастера нет активного приглашения.", 409, "MASTER_NOT_INVITED");
  }
  return {
    inviteId: invite.id,
    channel: normalizeInviteEmail(master.contactEmail) ? "EMAIL" : "PHONE",
  };
}
