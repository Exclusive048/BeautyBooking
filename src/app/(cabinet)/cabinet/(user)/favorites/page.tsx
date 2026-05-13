import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientFavoritesPage } from "@/features/client-cabinet/favorites/client-favorites-page";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/favorites");

  return <ClientFavoritesPage />;
}
