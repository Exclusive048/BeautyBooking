import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { bookingsQuerySchema, createBookingSchema } from "@/lib/bookings/schemas";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClientBooking, getProviderBookingsForOwner } from "@/lib/bookings/service";
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

  const result = await getProviderBookingsForOwner(user.id, providerId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok(result.data);
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
  const result = await createClientBooking(user.id, {
    providerId,
    serviceId,
    slotLabel,
    clientName,
    clientPhone,
    comment,
  });

  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok(result.data, { status: 201 });
}
