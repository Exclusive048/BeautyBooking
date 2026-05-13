import type { ReactNode } from "react";
import { CabinetLayout } from "@/features/cabinet/layout/cabinet-layout";
import { getSessionUser } from "@/lib/auth/session";
import { getClientSidebarCounts } from "@/lib/client-cabinet/sidebar-counts";
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

  const counts = user
    ? await getClientSidebarCounts(user.id)
    : { favorites: 0, upcomingBookings: 0, unreadNotifications: 0, pendingReviews: 0 };

  return (
    <CabinetLayout
      userLabel={userLabel}
      favoritesCount={counts.favorites}
      upcomingBookingsCount={counts.upcomingBookings}
      unreadNotificationsCount={counts.unreadNotifications}
      pendingReviewsCount={counts.pendingReviews}
    >
      {/* Mirror the master cabinet content pattern: full-width content area
          with per-page horizontal padding, generous top/bottom rhythm. No
          max-width — bookings list and other dense surfaces use the full
          viewport on desktop; centered narrow forms can opt in themselves. */}
      <div className="px-4 py-6 md:px-6 md:py-10 lg:px-10">
        <div className="mx-auto w-full max-w-[1240px]">{children}</div>
      </div>
    </CabinetLayout>
  );
}
