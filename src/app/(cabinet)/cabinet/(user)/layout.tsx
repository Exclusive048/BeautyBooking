import type { ReactNode } from "react";
import { CabinetLayout } from "@/features/cabinet/layout/cabinet-layout";
import { getSessionUser } from "@/lib/auth/session";
import { getUserFavoritesCount } from "@/lib/favorites/get-favorites";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  children: ReactNode;
};

export default async function UserCabinetLayout({ children }: Props) {
  const user = await getSessionUser();
  const userLabel =
    user?.displayName?.trim() ||
    user?.firstName?.trim() ||
    user?.phone?.trim() ||
    UI_TEXT.brand.name;

  // Favorites count drives the sidebar badge. Hidden when 0; the indexed
  // count() is cheap, but if cabinet navigation becomes a hot path we can
  // wrap this in a 30s Redis cache layer.
  const favoritesCount = user ? await getUserFavoritesCount(user.id) : 0;

  return (
    <CabinetLayout userLabel={userLabel} favoritesCount={favoritesCount}>
      {children}
    </CabinetLayout>
  );
}

