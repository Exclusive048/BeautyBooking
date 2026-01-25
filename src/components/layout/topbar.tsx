import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/features/auth/components/logout-button";

export async function Topbar() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-neutral-900" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-neutral-900">BeautyHub</div>
            <div className="text-xs text-neutral-500">запись к мастерам</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/providers">Каталог</Link>
          </Button>

          {user ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/cabinet?tab=profile">Мой кабинет</Link>
              </Button>

              <Button asChild variant="secondary" className="hidden sm:inline-flex">
                <Link href="/cabinet?tab=bookings">Мои записи</Link>
              </Button>

              <LogoutButton />
            </>
          ) : (
            <Button asChild>
              <Link href="/login">Вход</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
