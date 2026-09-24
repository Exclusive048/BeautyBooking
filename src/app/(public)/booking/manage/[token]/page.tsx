import type { Metadata } from "next";
import { AppError } from "@/lib/api/errors";
import { getGuestManageView, resolveGuestManageScope } from "@/lib/bookings/guest-manage";
import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";
import { UI_TEXT } from "@/lib/ui/text";
import {
  GuestManagePage,
  type GuestManagePageState,
} from "@/features/booking/guest-manage/guest-manage-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: UI_TEXT.guestManage.pageTitle,
  // Предъявительская ссылка: страница не индексируется и не кэшируется.
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * GUEST-MANAGE-LINK (2026-09-24) — страница «Управлять записью» по ссылке из
 * экрана успеха гостевой записи. Данные читаются напрямую сервисом (не
 * self-fetch). Время — salon-tz с меткой зоны (`formatBookingWhenLabel`,
 * rule 17): страницу открывают с любого устройства, и сравнить часы зрителя
 * с часами салона без метки нельзя.
 */
export default async function GuestManageBookingPage({ params }: Props) {
  const { token } = await params;
  let state: GuestManagePageState;
  try {
    const scope = await resolveGuestManageScope(token);
    const view = await getGuestManageView(scope);
    state = {
      kind: "ok",
      view,
      whenLabels: Object.fromEntries(
        view.items.map((item) => [
          item.bookingId,
          {
            when: formatBookingWhenLabel(item.startAtUtc ? new Date(item.startAtUtc) : null, view.timezone),
            proposed: formatBookingWhenLabel(
              item.proposedStartAt ? new Date(item.proposedStartAt) : null,
              view.timezone,
            ),
          },
        ]),
      ),
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "GUEST_MANAGE_ACCOUNT_REQUIRED") {
      state = { kind: "account" };
    } else if (error instanceof AppError && error.code === "GUEST_MANAGE_LINK_INVALID") {
      state = { kind: "invalid" };
    } else {
      throw error;
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <GuestManagePage token={token} state={state} />
    </div>
  );
}
