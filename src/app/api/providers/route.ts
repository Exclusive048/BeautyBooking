import { ok } from "@/lib/api/response";
import { listProviderCards } from "@/lib/providers/queries";

export async function GET() {
  const providers = await listProviderCards();
  return ok({ providers });
}
