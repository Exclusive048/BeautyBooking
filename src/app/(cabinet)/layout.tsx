import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Topbar />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          <Link href="/" className="hover:underline">Главная</Link>
          <span>·</span>
          <Link href="/providers" className="hover:underline">Каталог</Link>
          <span>·</span>
          <Link href="/cabinet/master" className="hover:underline">Кабинет мастера</Link>
          <span>·</span>
          <Link href="/cabinet/studio" className="hover:underline">Кабинет студии</Link>
        </div>

        {children}
      </div>
    </div>
  );
}
