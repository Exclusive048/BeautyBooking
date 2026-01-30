import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { emptyBodySchema } from "@/lib/providers/schemas";
import { createStudioProfile } from "@/lib/profiles/professional";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = emptyBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const result = await createStudioProfile({ userId: auth.user.id, roles: auth.user.roles });

  if (result.status === "already-exists") {
    return fail("Studio profile already exists", 409, "ALREADY_EXISTS");
  }

  return ok(
    { profile: { id: result.studioId, providerId: result.providerId } },
    { status: 201 }
  );
}
