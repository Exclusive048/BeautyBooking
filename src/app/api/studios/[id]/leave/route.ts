import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { notifyStudioMemberLeft } from "@/lib/notifications/studio-notifications";
import { getRequestId, logError } from "@/lib/logging/logger";

function resolveUserName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  fallback: string;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  const phone = input.phone?.trim();
  if (phone) return phone;
  return input.fallback;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;

  // SEC-28: `[id]` в ветке `/api/studios/[id]/**` означает **`Provider.id`** —
  // так его трактуют все соседние хендлеры через `ensureStudioAccess`
  // (`lib/studios/access.ts:9-11`), и так его шлют все клиентские вызывающие
  // (`studio-cabinet/settings/*` несут об этом отдельные комментарии). Этот
  // роут единственный читал сегмент как `Studio.id`. Эксплуатируемости не было
  // — дальше всё скоупится на `auth.user.id`, — но это ровно ловушка «two id
  // systems», о которой предупреждает `lib/studio/tenancy.ts:19-25`: следующий
  // роут в этой ветке мог выбрать не ту систему и уже не так безобидно.
  // Совместимость не нужна: у роута ноль вызывающих (живой путь ухода —
  // `POST /api/cabinet/master/leave-studio`), а приём обоих видов id и был бы
  // той самой двусмысленностью.
  const studio = await prisma.studio.findUnique({
    where: { providerId: p.id },
    select: {
      id: true,
      providerId: true,
      ownerUserId: true,
      provider: { select: { name: true, ownerUserId: true } },
    },
  });
  if (!studio) return fail("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId: auth.user.id,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true, roles: true },
  });

  if (!membership) {
    return fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  if (membership.roles.includes(StudioRole.OWNER)) {
    return fail("Владелец не может покинуть свою студию.", 403, "OWNER_CANNOT_LEAVE");
  }

  const canLeave =
    membership.roles.includes(StudioRole.MASTER) ||
    membership.roles.includes(StudioRole.ADMIN);

  if (!canLeave) {
    return fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  await prisma.studioMembership.update({
    where: { id: membership.id },
    data: { status: MembershipStatus.LEFT, leftAt: new Date() },
  });
  await prisma.provider.updateMany({
    where: {
      ownerUserId: auth.user.id,
      type: ProviderType.MASTER,
      studioId: studio.providerId,
    },
    data: { studioId: null },
  });

  try {
    const ownerUserId = studio.ownerUserId ?? studio.provider.ownerUserId ?? null;
    if (ownerUserId) {
      const profile = await prisma.userProfile.findUnique({
        where: { id: auth.user.id },
        select: { displayName: true, firstName: true, lastName: true, phone: true },
      });
      const masterName = resolveUserName({
        displayName: profile?.displayName,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        phone: profile?.phone,
        fallback: "Мастер",
      });
      await notifyStudioMemberLeft({
        studioOwnerUserId: ownerUserId,
        masterName,
        studioName: studio.provider.name || "Студия",
      });
    }
  } catch (error) {
    logError("POST /api/studios/[id]/leave notification failed", {
      requestId: getRequestId(_req),
      route: "POST /api/studios/{id}/leave",
      stack: error instanceof Error ? error.stack : String(error),
    });
  }

  return ok({ left: true });
}
