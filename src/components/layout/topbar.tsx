import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Topbar() {
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

        <nav className="hidden items-center gap-1 md:flex">
          <Link className="rounded-xl px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100" href="/providers">
            Каталог
          </Link>
          <Link className="rounded-xl px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100" href="/provider">
            Кабинет мастера
          </Link>
          <Link className="rounded-xl px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100" href="/admin">
            Админ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="secondary">Войти</Button>
          <Button className="hidden md:inline-flex" asChild>
            <Link href="/provider">Добавить профиль</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
