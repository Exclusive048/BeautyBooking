import type { ReactNode } from "react";
import { CabinetSidebar } from "@/features/cabinet/layout/cabinet-sidebar";
import { CabinetBottomNav, type ClientNavAttention } from "@/features/cabinet/layout/cabinet-bottom-nav";

type Props = {
  children: ReactNode;
  userLabel?: string | null;
  favoritesCount?: number;
  upcomingBookingsCount?: number;
  unreadNotificationsCount?: number;
  pendingReviewsCount?: number;
  /** NAV-ATTENTION-01 — счётчики «ждёт действия» для вкладок нижней панели. */
  attention?: ClientNavAttention;
};

/**
 * Client cabinet shell. Mirrors the master cabinet pattern: full-viewport
 * sidebar + flex-1 content. Pages own their own max-width / horizontal
 * padding — the layout deliberately does not constrain (so a bookings list
 * can use the whole desktop width while a settings page can still center).
 *
 * Mobile: sidebar collapses, bottom-nav handles primary navigation. The
 * `pb-24 lg:pb-0` on the main element keeps content above the fixed bottom
 * nav on small screens.
 */
export function CabinetLayout({
  children,
  userLabel,
  favoritesCount,
  upcomingBookingsCount,
  unreadNotificationsCount,
  pendingReviewsCount,
  attention,
}: Props) {
  return (
    <div className="flex min-h-screen bg-bg-page">
      <div className="hidden border-r border-border-subtle lg:block lg:shrink-0">
        {/* FIX-BATCH-A: park below the now-sticky global navbar (see master layout). */}
        <div className="sticky top-[var(--topbar-h)] h-[calc(100dvh-var(--topbar-h))] overflow-y-auto p-4">
          <CabinetSidebar
            userLabel={userLabel}
            favoritesCount={favoritesCount}
            upcomingBookingsCount={upcomingBookingsCount}
            unreadNotificationsCount={unreadNotificationsCount}
            pendingReviewsCount={pendingReviewsCount}
          />
        </div>
      </div>

      <main data-testid="page-main" className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>

      <CabinetBottomNav attention={attention} />
    </div>
  );
}
