"use client";

import Link from "next/link";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  userLabel: string;
};

export function AuthUserMenu({ userLabel }: Props) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
        {userLabel}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg">
        <Link href="/providers" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50">
          {UI_TEXT.nav.catalog}
        </Link>
        <Link href="/cabinet/client/bookings" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50">
          {UI_TEXT.nav.myBookings}
        </Link>
        <Link href="/cabinet/client/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50">
          {UI_TEXT.nav.profile}
        </Link>
        <Link href="/cabinet" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50">
          {UI_TEXT.nav.myCabinet}
        </Link>
        <div className="mt-1 border-t pt-2">
          <LogoutButton />
        </div>
      </div>
    </details>
  );
}
