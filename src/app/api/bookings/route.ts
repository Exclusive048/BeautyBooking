import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { bookingsQuerySchema, createBookingSchema } from "@/lib/bookings/schemas";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { AccountType } from "@prisma/client";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const parsed = bookingsQuerySchema.safeParse({
    providerId: url.searchParams.get("providerId"),
  });
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }
  const { providerId } = parsed.data;

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, ownerUserId: true },
  });

  if (!provider) {
    return fail("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  if (!provider.ownerUserId || provider.ownerUserId !== user.id) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  const bookings = await prisma.booking.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    include: { service: true },
    take: 200,
  });

  return ok({ bookings });
}

export async function POST(req: Request) {
  // ✅ Строго: только авторизованные клиенты
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // ✅ Строго: у юзера должна быть роль CLIENT (она у тебя всегда добавляется при логине, но оставим проверку)
  const roleError = requireRole(user, AccountType.CLIENT);
  if (roleError) return roleError;

  const body = await req.json().catch(() => null);
  const parsedBody = createBookingSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(formatZodError(parsedBody.error), 400, "VALIDATION_ERROR");
  }
  const { providerId, serviceId, slotLabel, clientName, clientPhone, comment } =
    parsedBody.data;

  // Проверяем, что service принадлежит provider
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true },
  });

  if (!service || service.providerId !== providerId) {
    return fail(
      "Service does not belong to provider",
      400,
      "SERVICE_NOT_BELONGS_TO_PROVIDER"
    );
  }

  const booking = await prisma.booking.create({
    data: {
      providerId,
      serviceId,
      slotLabel,
      clientName,
      clientPhone,
      comment,
      clientUserId: user.id, // ✅ всегда
    },
  });

  return ok({ booking }, { status: 201 });
}
