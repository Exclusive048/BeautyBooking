import { AccountType, MediaEntityType, MediaKind, MembershipStatus, ProviderType, StudioRole, type UserProfile } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { resolveChatAccessForBooking } from "@/lib/chat/access";

function isSiteAdmin(user: UserProfile): boolean {
  return user.roles.includes(AccountType.ADMIN) || user.roles.includes(AccountType.SUPERADMIN);
}

async function isStudioAdminOrOwnerByStudioProviderId(studioProviderId: string, userId: string): Promise<boolean> {
  const studioProvider = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!studioProvider || studioProvider.type !== ProviderType.STUDIO) return false;
  if (studioProvider.ownerUserId === userId) return true;

  const studio = await prisma.studio.findUnique({
    where: { providerId: studioProvider.id },
    select: { id: true, ownerUserId: true },
  });
  if (!studio) return false;
  if (studio.ownerUserId === userId) return true;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function canManageProvider(providerId: string, userId: string): Promise<boolean> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, ownerUserId: true, studioId: true },
  });
  if (!provider) return false;

  if (provider.type === ProviderType.STUDIO) {
    return isStudioAdminOrOwnerByStudioProviderId(provider.id, userId);
  }

  if (provider.ownerUserId === userId) return true;
  if (provider.studioId && (await isStudioAdminOrOwnerByStudioProviderId(provider.studioId, userId))) return true;
  return false;
}

/**
 * MASTER-CHAT-ATTACHMENT-FIX-A — chat attachment read ACL.
 *
 * MediaAsset rows for chat attachments are tagged with
 * `entityType=CHAT_MESSAGE` and `entityId="chat-message:<chatMessageId>"`
 * (see `markAttachmentUsed` in `src/lib/chat/attachment.ts`). To resolve
 * read access we:
 *
 *   1. Parse the chatMessageId out of the entityId tag.
 *   2. Load the ChatMessage → BookingChat → Booking so we know who the
 *      two chat participants are.
 *   3. Reuse `resolveChatAccessForBooking` — the canonical chat-access
 *      helper. It admits client + master (the two chat participants) and
 *      denies everyone else, including studio admins (privacy 152-ФЗ
 *      invariant, by-design).
 *
 * **Important difference from `resolveChatAccess`**: we deliberately
 * IGNORE the availability gate (`isAvailable`). The availability rules
 * gate **sending** new messages — they say e.g. "no new messages after
 * booking ended". For READ access to attachments already in the
 * thread history, participants must remain able to view them
 * indefinitely (same way they can scroll past messages in finished
 * bookings).
 */
function parseChatMessageIdFromEntity(entityId: string): string | null {
  const prefix = "chat-message:";
  if (!entityId.startsWith(prefix)) return null;
  const id = entityId.slice(prefix.length);
  return id.length > 0 ? id : null;
}

async function canReadChatAttachmentMedia(user: UserProfile, entityId: string): Promise<boolean> {
  const chatMessageId = parseChatMessageIdFromEntity(entityId);
  if (!chatMessageId) return false;

  const message = await prisma.chatMessage.findUnique({
    where: { id: chatMessageId },
    select: {
      id: true,
      chat: {
        select: {
          booking: {
            select: {
              id: true,
              status: true,
              startAtUtc: true,
              clientUserId: true,
              masterProvider: {
                select: { ownerUserId: true, name: true },
              },
            },
          },
        },
      },
    },
  });
  const booking = message?.chat.booking ?? null;
  if (!booking) return false;

  const isClient = Boolean(booking.clientUserId && booking.clientUserId === user.id);
  const isMaster = Boolean(
    booking.masterProvider?.ownerUserId && booking.masterProvider.ownerUserId === user.id,
  );
  // Read access — participants only. Availability gate is intentionally
  // skipped (see helper doc above). resolveChatAccessForBooking is also
  // imported as documentation anchor but we apply its membership logic
  // directly here so we can keep the availability bypass explicit.
  void resolveChatAccessForBooking; // imported for invariant cross-ref
  return isClient || isMaster;
}

async function canReadBookingMedia(user: UserProfile, bookingId: string): Promise<boolean> {
  if (user.roles.includes(AccountType.ADMIN) || user.roles.includes(AccountType.SUPERADMIN)) {
    return true;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      provider: { select: { id: true, type: true, ownerUserId: true, studioId: true } },
      masterProvider: { select: { ownerUserId: true } },
    },
  });
  if (!booking) {
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }

  if (booking.clientUserId && booking.clientUserId === user.id) return true;
  if (booking.provider.ownerUserId && booking.provider.ownerUserId === user.id) return true;
  if (booking.masterProvider?.ownerUserId && booking.masterProvider.ownerUserId === user.id) return true;

  if (booking.provider.type === ProviderType.STUDIO) {
    return isStudioAdminOrOwnerByStudioProviderId(booking.provider.id, user.id);
  }

  if (booking.provider.studioId) {
    return isStudioAdminOrOwnerByStudioProviderId(booking.provider.studioId, user.id);
  }

  return false;
}

export async function ensureCanManageMedia(
  user: UserProfile,
  entityType: MediaEntityType,
  entityId: string,
  kind: MediaKind
): Promise<void> {
  if (entityType === MediaEntityType.SITE) {
    const isAllowedSiteKind = kind === MediaKind.AVATAR || kind === MediaKind.PORTFOLIO;
    if (entityId !== "site" || !isAllowedSiteKind || !isSiteAdmin(user)) {
      throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    }
    return;
  }

  if (entityType === MediaEntityType.USER) {
    const isAllowedUserKind = kind === MediaKind.AVATAR || kind === MediaKind.MODEL_APPLICATION_PHOTO;
    if (!isAllowedUserKind || entityId !== user.id) {
      throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    }
    return;
  }

  if (entityType === MediaEntityType.MODEL_APPLICATION) {
    const application = await prisma.modelApplication.findUnique({
      where: { id: entityId },
      select: { id: true, clientUserId: true, offer: { select: { masterId: true } } },
    });
    if (!application) {
      throw new AppError("Ничего не найдено.", 404, "NOT_FOUND");
    }
    if (application.clientUserId === user.id) return;
    await resolveMasterAccess(application.offer.masterId, user.id);
    return;
  }

  if (entityType === MediaEntityType.MASTER) {
    const master = await prisma.provider.findUnique({
      where: { id: entityId },
      select: { id: true, type: true, ownerUserId: true, studioId: true },
    });
    if (!master || master.type !== ProviderType.MASTER) {
      throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
    }
    if (master.ownerUserId === user.id) return;
    if (master.studioId && (await isStudioAdminOrOwnerByStudioProviderId(master.studioId, user.id))) return;
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  if (entityType === MediaEntityType.STUDIO) {
    const canManage = await isStudioAdminOrOwnerByStudioProviderId(entityId, user.id);
    if (!canManage) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    return;
  }

  if (entityType === MediaEntityType.CLIENT_CARD) {
    if (kind !== MediaKind.CLIENT_CARD_PHOTO) {
      throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    }
    const card = await prisma.clientCard.findUnique({
      where: { id: entityId },
      select: { id: true, providerId: true },
    });
    if (!card) {
      throw new AppError("Карточка клиента не найдена.", 404, "CLIENT_CARD_NOT_FOUND");
    }
    const canManage = await canManageProvider(card.providerId, user.id);
    if (!canManage) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
    return;
  }

  throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
}

export async function ensureCanReadMedia(
  user: UserProfile | null,
  entityType: MediaEntityType,
  entityId: string,
  kind?: MediaKind
): Promise<void> {
  const kindAllowedForEntity = (() => {
    if (!kind) return true;
    switch (entityType) {
      case MediaEntityType.USER:
        return kind === MediaKind.AVATAR || kind === MediaKind.MODEL_APPLICATION_PHOTO;
      case MediaEntityType.MASTER:
      case MediaEntityType.STUDIO:
      case MediaEntityType.SITE:
        return kind === MediaKind.AVATAR || kind === MediaKind.PORTFOLIO;
      case MediaEntityType.MODEL_APPLICATION:
        return kind === MediaKind.MODEL_APPLICATION_PHOTO;
      case MediaEntityType.CLIENT_CARD:
        return kind === MediaKind.CLIENT_CARD_PHOTO;
      case MediaEntityType.BOOKING:
        return kind === MediaKind.BOOKING_REFERENCE;
      case MediaEntityType.CHAT_MESSAGE:
        return kind === MediaKind.CHAT_ATTACHMENT;
      default:
        return false;
    }
  })();

  if (!kindAllowedForEntity) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  switch (entityType) {
    case MediaEntityType.USER: {
      if (!user || (user.id !== entityId && !isSiteAdmin(user))) {
        throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      }
      return;
    }
    case MediaEntityType.SITE: {
      if (entityId !== "site") {
        throw new AppError("Ничего не найдено.", 404, "NOT_FOUND");
      }
      if (kind === MediaKind.AVATAR || kind === MediaKind.PORTFOLIO) {
        return;
      }
      if (!user || !isSiteAdmin(user)) {
        throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      }
      return;
    }
    case MediaEntityType.MASTER:
    case MediaEntityType.STUDIO: {
      // SECURITY-EXPOSURE-AUDIT-01 #3: this is the PRIVATE/management read gate.
      // It used to blanket-allow anyone (even anonymous) to read MASTER/STUDIO
      // AVATAR/PORTFOLIO, so hidden, unpublished and delete-orphaned portfolio
      // stayed fetchable. Public serving of *published + public* portfolio (and
      // avatars) is now handled explicitly — the visibility-gated public branch
      // in `/api/media/file/[id]` and the public filter in `listMediaAssets` —
      // NOT here. Here, only the owner/studio-admin (and platform admin) may
      // read, which is what the file route falls back to for a non-public asset.
      if (!user) {
        throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      }
      const canManage = await canManageProvider(entityId, user.id);
      if (!canManage) {
        throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      }
      return;
    }
    case MediaEntityType.MODEL_APPLICATION: {
      if (!user) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      const application = await prisma.modelApplication.findUnique({
        where: { id: entityId },
        select: { id: true, clientUserId: true, offer: { select: { masterId: true } } },
      });
      if (!application) {
        throw new AppError("Ничего не найдено.", 404, "NOT_FOUND");
      }
      if (application.clientUserId === user.id) return;
      await resolveMasterAccess(application.offer.masterId, user.id);
      return;
    }
    case MediaEntityType.CLIENT_CARD: {
      if (!user) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      const card = await prisma.clientCard.findUnique({
        where: { id: entityId },
        select: { id: true, providerId: true },
      });
      if (!card) {
        throw new AppError("Карточка клиента не найдена.", 404, "CLIENT_CARD_NOT_FOUND");
      }
      const canManage = await canManageProvider(card.providerId, user.id);
      if (!canManage) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      return;
    }
    case MediaEntityType.BOOKING: {
      if (!user) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      const allowed = await canReadBookingMedia(user, entityId);
      if (!allowed) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      return;
    }
    case MediaEntityType.CHAT_MESSAGE: {
      // MASTER-CHAT-ATTACHMENT-FIX-A: chat attachments — read access
      // for the two chat participants only. Studio admins explicitly
      // not admitted (privacy 152-ФЗ invariant — chat is 1:1
      // client↔master only, see resolveChatAccess).
      if (!user) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      const allowed = await canReadChatAttachmentMedia(user, entityId);
      if (!allowed) throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
      return;
    }
    default:
      throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

}
