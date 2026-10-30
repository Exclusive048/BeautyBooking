import "server-only";

import { AccountType, Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { EMPTY_ADMIN_AUDIT_CONTEXT, type AdminAuditContext } from "@/lib/audit/admin-audit-context";
import { ADMIN_AUDIT_ACTIONS } from "@/lib/audit/types";
import { BOOTSTRAP_ADMIN_EMAILS } from "@/lib/auth/bootstrap-admins";
import { logInfo } from "@/lib/logging/logger";
import { unlinkAllPushDevices } from "@/lib/notifications/native-push/devices";
import { prisma } from "@/lib/prisma";
import { invalidateMeIdentityCache } from "@/lib/users/me";

/**
 * USER-BLOCKING-01 — единственный писатель `UserProfile.blockedAt` /
 * `blockedByUserId` / `blockedReason`. Что отметка делает со входом и
 * сессиями — `lib/auth/account-block.ts`.
 *
 * Блокировка — ОДНА транзакция (инв. #18): отметка, отзыв всех семей сессий,
 * удаление push-устройств приложения и строка `AdminAuditLog` — либо всё,
 * либо ничего. Сессии отзываются не «на всякий случай»: чтение сессии и так
 * требует `blockedAt: null`, но отзыв закрывает и refresh-токен (ротация его
 * не обменяет), и список «Где я вошёл» после разблокировки не покажет старые
 * входы живыми. Push-токены приложения и подписки web-push браузера
 * уходят, потому что push не проходит через сессию: заблокированный
 * продолжал бы получать уведомления о записях. После разблокировки и
 * нового входа они восстанавливаются сами — приложение регистрирует токен
 * при входе, браузер пересылает подписку при загрузке
 * (`syncExistingSubscription`).
 *
 * Запреты:
 * - **себя** — администратор не запирает собственный аккаунт по ошибке;
 * - **постоянного админа** (`BOOTSTRAP_ADMIN_EMAILS`) — только с
 *   ПОДТВЕРЖДЁННЫМ адресом: вписать этот адрес себе может кто угодно (заявка,
 *   инв. #41), и без условия любой обзавёлся бы иммунитетом к блокировке;
 * - **администратора** (ADMIN или SUPERADMIN) — только суперадминистратор.
 *   Строгий вариант выбран намеренно: блокировка администратора снимает с
 *   платформы человека с полным доступом, и решать это равному по правам
 *   нельзя — иначе два администратора могли бы запереть друг друга. На проде
 *   постоянный админ — ADMIN, поэтому сейчас администраторов не блокирует
 *   никто, пока владелец не назначит суперадминистратора. Разблокировка
 *   администратора — по тому же правилу;
 * - **последнего администратора** — после блокировки должен остаться хотя
 *   бы один действующий ADMIN/SUPERADMIN. При живой сессии вызывающего это
 *   следует из запрета «себя», но гонка двух встречных блокировок обходит
 *   любую проверку в Read Committed, поэтому транзакция — Serializable:
 *   второй коммит падает P2034 и получает 409, а не запирает платформу.
 */

export const BLOCK_REASON_MAX_LENGTH = 500;

const ADMIN_ROLES: AccountType[] = [AccountType.ADMIN, AccountType.SUPERADMIN];

const TARGET_SELECT = {
  id: true,
  roles: true,
  email: true,
  emailVerifiedAt: true,
  isDeleted: true,
  blockedAt: true,
  blockedReason: true,
} as const;

type BlockTarget = Prisma.UserProfileGetPayload<{ select: typeof TARGET_SELECT }>;

type Actor = { id: string; roles: AccountType[] };

export type AdminUserBlockState = {
  userId: string;
  blockedAt: string | null;
  blockedReason: string | null;
};

type BlockInput = {
  actor: Actor;
  targetUserId: string;
  reason: string;
  context?: AdminAuditContext;
};

type UnblockInput = {
  actor: Actor;
  targetUserId: string;
  reason?: string | null;
  context?: AdminAuditContext;
};

function isAdminAccount(roles: readonly AccountType[]): boolean {
  return roles.some((role) => ADMIN_ROLES.includes(role));
}

function isBootstrapAdmin(target: BlockTarget): boolean {
  if (!target.email || !target.emailVerifiedAt) return false;
  const email = target.email.trim().toLowerCase();
  return BOOTSTRAP_ADMIN_EMAILS.some((bootstrap) => bootstrap.toLowerCase() === email);
}

function notFound(): AppError {
  return new AppError("Пользователь не найден.", 404, "NOT_FOUND");
}

async function loadTarget(tx: Prisma.TransactionClient, targetUserId: string): Promise<BlockTarget> {
  const target = await tx.userProfile.findUnique({ where: { id: targetUserId }, select: TARGET_SELECT });
  if (!target || target.isDeleted) throw notFound();
  return target;
}

/** Права на блокировку и разблокировку одинаковы: см. шапку модуля. */
function assertMayManage(actor: Actor, target: BlockTarget): void {
  if (isAdminAccount(target.roles) && !actor.roles.includes(AccountType.SUPERADMIN)) {
    throw new AppError(
      "Блокировать и разблокировать администраторов может только суперадминистратор.",
      403,
      "FORBIDDEN",
    );
  }
}

function serializationConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return new AppError("Данные пользователя только что изменились. Обновите страницу.", 409, "CONFLICT");
  }
  return null;
}

export async function blockUser(input: BlockInput): Promise<AdminUserBlockState> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new AppError("Укажите причину блокировки.", 400, "VALIDATION_ERROR");
  }
  if (input.actor.id === input.targetUserId) {
    throw new AppError("Нельзя заблокировать собственный аккаунт.", 403, "FORBIDDEN");
  }

  const now = new Date();
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await loadTarget(tx, input.targetUserId);
        if (target.blockedAt) {
          throw new AppError("Пользователь уже заблокирован.", 409, "CONFLICT");
        }
        if (isBootstrapAdmin(target)) {
          throw new AppError("Этот аккаунт — постоянный администратор платформы, его нельзя заблокировать.", 403, "FORBIDDEN");
        }
        assertMayManage(input.actor, target);

        if (isAdminAccount(target.roles)) {
          const remainingAdmins = await tx.userProfile.count({
            where: {
              id: { not: target.id },
              isDeleted: false,
              blockedAt: null,
              roles: { hasSome: ADMIN_ROLES },
            },
          });
          if (remainingAdmins === 0) {
            throw new AppError("Нельзя заблокировать последнего администратора платформы.", 409, "CONFLICT");
          }
        }

        await tx.userProfile.update({
          where: { id: target.id },
          data: { blockedAt: now, blockedByUserId: input.actor.id, blockedReason: reason },
        });
        const revoked = await tx.refreshSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: now },
        });
        const pushDevicesRemoved = await unlinkAllPushDevices(tx, target.id);
        const webPush = await tx.pushSubscription.deleteMany({ where: { userId: target.id } });

        await createAdminAuditLog({
          tx,
          adminUserId: input.actor.id,
          action: ADMIN_AUDIT_ACTIONS.USER_BLOCKED,
          targetType: "user",
          targetId: target.id,
          details: {
            revokedSessions: revoked.count,
            pushDevicesRemoved,
            webPushSubscriptionsRemoved: webPush.count,
          },
          reason,
          context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
        });

        return {
          revokedSessions: revoked.count,
          pushDevicesRemoved,
          webPushSubscriptionsRemoved: webPush.count,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    void invalidateMeIdentityCache(input.targetUserId);
    logInfo("admin.users.blocked", {
      adminUserId: input.actor.id,
      targetUserId: input.targetUserId,
      revokedSessions: result.revokedSessions,
      pushDevicesRemoved: result.pushDevicesRemoved,
      webPushSubscriptionsRemoved: result.webPushSubscriptionsRemoved,
    });
    return { userId: input.targetUserId, blockedAt: now.toISOString(), blockedReason: reason };
  } catch (error) {
    throw serializationConflict(error) ?? error;
  }
}

export async function unblockUser(input: UnblockInput): Promise<AdminUserBlockState> {
  const reason = input.reason?.trim() || null;
  try {
    await prisma.$transaction(
      async (tx) => {
        const target = await loadTarget(tx, input.targetUserId);
        if (!target.blockedAt) {
          throw new AppError("Пользователь не заблокирован.", 409, "CONFLICT");
        }
        assertMayManage(input.actor, target);

        await tx.userProfile.update({
          where: { id: target.id },
          data: { blockedAt: null, blockedByUserId: null, blockedReason: null },
        });
        await createAdminAuditLog({
          tx,
          adminUserId: input.actor.id,
          action: ADMIN_AUDIT_ACTIONS.USER_UNBLOCKED,
          targetType: "user",
          targetId: target.id,
          // Причина снятой блокировки — в аудите: в профиле её больше нет.
          details: {
            blockedAt: target.blockedAt.toISOString(),
            blockedReason: target.blockedReason,
          },
          reason,
          context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    void invalidateMeIdentityCache(input.targetUserId);
    logInfo("admin.users.unblocked", { adminUserId: input.actor.id, targetUserId: input.targetUserId });
    return { userId: input.targetUserId, blockedAt: null, blockedReason: null };
  } catch (error) {
    throw serializationConflict(error) ?? error;
  }
}
