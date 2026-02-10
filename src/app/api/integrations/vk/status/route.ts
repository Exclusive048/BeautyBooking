import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { getVkLinkSummary } from "@/lib/vk/links";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const status = await getVkLinkSummary(auth.user.id);
  return ok({
    linked: status.linked,
    enabled: status.enabled,
  });
}
