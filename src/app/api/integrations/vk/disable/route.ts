import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, toAppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { logoutVkSession } from "@/lib/vk/oauth";

export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const link = await prisma.vkLink.findUnique({
      where: { userId: auth.user.id },
      select: { id: true, accessToken: true, isEnabled: true },
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

    try {
      await logoutVkSession({ accessToken: link.accessToken });
    } catch {
      // optional logout, ignore errors
    }

    return ok({ enabled: false });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
