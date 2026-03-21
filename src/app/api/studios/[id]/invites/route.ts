import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/otp";
import { MembershipStatus, ProviderType } from "@prisma/client";
import { toAppError } from "@/lib/api/errors";
import { ensureStudioTeamLimit } from "@/lib/studio/team-limits";
import {
  loadInviteWithRelations,
  notifyStudioInviteReceived,
  notifyStudioInviteRevoked,
} from "@/lib/notifications/studio-notifications";
import { getRequestId, logError } from "@/lib/logging/logger";

const createSchema = z.object({
  phone: z.string().trim().min(6),
});

const revokeSchema = z
  .object({
    inviteId: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(6).optional(),
  })
  .refine((value) => Boolean(value.inviteId || value.phone), {
    message: "inviteId or phone is required",
  });

function normalizeInvitePhone(input: string): string {
  const normalized = normalizePhone(input);
  if (!normalized) return "";
  const match = normalized.match(/^\+8(\d{10})$/);
  if (match) return `+7${match[1]}`;
  return normalized;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;

  const provider = await prisma.provider.findUnique({
    where: { id: p.id },
    select: { id: true, type: true },
  });
  if (!provider || provider.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const studio = await prisma.studio.findUnique({
    where: { providerId: provider.id },
    select: { id: true },
  });
  if (!studio) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const invites = await prisma.studioInvite.findMany({
    where: { studioId: studio.id, status: MembershipStatus.PENDING },
    select: { id: true, phone: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return ok({ invites });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;

  const provider = await prisma.provider.findUnique({
    where: { id: p.id },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!provider || provider.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");
  const phone = normalizeInvitePhone(parsed.data.phone);
  if (!phone || phone.length < 8) {
    return fail("Invalid phone", 400, "VALIDATION_ERROR");
  }

  const studio = await prisma.studio.findUnique({
    where: { providerId: provider.id },
    select: { id: true },
  });
  if (!studio) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  try {
    await ensureStudioTeamLimit(auth.user.id, studio.id);
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }

  const existingInvite = await prisma.studioInvite.findUnique({
    where: { studioId_phone: { studioId: studio.id, phone } },
    select: { id: true, status: true },
  });

  const invite = await prisma.studioInvite.upsert({
    where: { studioId_phone: { studioId: studio.id, phone } },
    update: { status: MembershipStatus.PENDING, invitedByUserId: auth.user.id },
    create: {
      studioId: studio.id,
      phone,
      status: MembershipStatus.PENDING,
      invitedByUserId: auth.user.id,
    },
    select: { id: true, studioId: true, phone: true, status: true },
  });

  const shouldNotifyInvite = !existingInvite || existingInvite.status !== MembershipStatus.PENDING;
  if (shouldNotifyInvite) {
    try {
      const fullInvite = await loadInviteWithRelations(invite.id);
      if (fullInvite) {
        await notifyStudioInviteReceived(fullInvite);
      }
    } catch (error) {
      logError("POST /api/studios/[id]/invites notification failed", {
        requestId: getRequestId(req),
        route: "POST /api/studios/{id}/invites",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return ok({ invite }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;

  const provider = await prisma.provider.findUnique({
    where: { id: p.id },
    select: { id: true, type: true },
  });
  if (!provider || provider.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const studio = await prisma.studio.findUnique({
    where: { providerId: provider.id },
    select: { id: true },
  });
  if (!studio) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const phone = parsed.data.phone ? normalizeInvitePhone(parsed.data.phone) : null;

  const invite = await prisma.studioInvite.findFirst({
    where: {
      studioId: studio.id,
      ...(parsed.data.inviteId ? { id: parsed.data.inviteId } : {}),
      ...(phone ? { phone } : {}),
    },
    select: { id: true, status: true },
  });

  if (!invite) {
    return fail("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  if (invite.status !== MembershipStatus.PENDING) {
    return ok({ inviteId: invite.id, status: invite.status, revoked: false });
  }

  await prisma.studioInvite.update({
    where: { id: invite.id },
    data: { status: MembershipStatus.LEFT },
    select: { id: true },
  });

  try {
    const fullInvite = await loadInviteWithRelations(invite.id);
    if (fullInvite) {
      await notifyStudioInviteRevoked(fullInvite);
    }
  } catch (error) {
    logError("DELETE /api/studios/[id]/invites notification failed", {
      requestId: getRequestId(req),
      route: "DELETE /api/studios/{id}/invites",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return ok({ inviteId: invite.id, status: MembershipStatus.LEFT, revoked: true });
}
