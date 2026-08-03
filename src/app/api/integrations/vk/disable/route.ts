import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, toAppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/**
 * RKN-FIX-12 — this route used to follow the local disable with a best-effort
 * `logoutVkSession(link.accessToken)`, and that call was the ONLY reader of a
 * stored provider token anywhere in the codebase.
 *
 * It was dropped together with the column, because its purpose was circular:
 * the VK-side session it revoked was the one belonging to the access token WE
 * were holding. With nothing held, there is nothing to revoke — and the leak
 * surface it created (a live third-party credential at rest, for every linked
 * user, forever, never refreshed) far outweighed a courtesy call that was
 * already declared optional and swallowed on failure. The user's own VK
 * authorization remains revocable from VK's app settings, as before.
 */
export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const link = await prisma.vkLink.findUnique({
      where: { userId: auth.user.id },
      select: { id: true, isEnabled: true },
    });

    if (!link) {
      return fail("Сначала подключите VK", 409, "VK_NOT_LINKED");
    }

    if (link.isEnabled) {
      await prisma.vkLink.update({
        where: { id: link.id },
        data: { isEnabled: false },
      });
    }

    return ok({ enabled: false });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
